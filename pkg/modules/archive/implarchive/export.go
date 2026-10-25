package implarchive

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/archive"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
	"golang.org/x/sync/errgroup"
)

type exportService struct {
	settings       factory.ScopedProviderSettings
	telemetryStore telemetrystore.TelemetryStore
	dialer         *replicaDialer
	store          archivetypes.Store
	config         archive.Config
	holder         string
	stopC          chan struct{}
	healthyC       chan struct{}

	mu           sync.Mutex
	partitions   map[string]archivetypes.Partition
	firstSeen    map[string][]archivetypes.Part
	staleIndexes map[string]bool
}

// exportJob is one partition of one table on one shard, with the parts every replica of
// the shard holds in it.
type exportJob struct {
	table     archivetypes.Table
	mappings  []archivetypes.ColumnMapping
	version   string
	partition archivetypes.Partition
	shard     int
	replicas  map[string]replica
	snapshot  map[string][]archivetypes.Part
}

// NewExportService runs the export cycle (ADR 0002 §3) every archive interval: partitions
// past retention are exported part by part from a replica that holds all their rows, and
// published by a commit fenced by the signal's lease.
func NewExportService(providerSettings factory.ProviderSettings, telemetryStore telemetrystore.TelemetryStore, dsn string, store archivetypes.Store, config archive.Config) (factory.ServiceWithHealthy, error) {
	dialer, err := newReplicaDialer(dsn, config.Limits.Concurrency+1)
	if err != nil {
		return nil, err
	}

	return &exportService{
		settings:       factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/archive/implarchive"),
		telemetryStore: telemetryStore,
		dialer:         dialer,
		store:          store,
		config:         config,
		holder:         newLeaseHolder(),
		stopC:          make(chan struct{}),
		healthyC:       make(chan struct{}),
		partitions:     make(map[string]archivetypes.Partition),
		firstSeen:      make(map[string][]archivetypes.Part),
		staleIndexes:   make(map[string]bool),
	}, nil
}

func (service *exportService) Start(ctx context.Context) error {
	close(service.healthyC)
	defer service.dialer.close()

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-service.stopC:
			cancel()
		case <-ctx.Done():
		}
	}()

	if !service.config.Logs.Enabled {
		<-ctx.Done()
		return nil
	}

	ticker := time.NewTicker(service.config.Interval)
	defer ticker.Stop()

	for {
		if err := service.cycle(ctx); err != nil && ctx.Err() == nil {
			service.settings.Logger().WarnContext(ctx, "archive export cycle failed", slog.Duration("interval", service.config.Interval), errors.Attr(err))
		}

		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}

func (service *exportService) Healthy() <-chan struct{} {
	return service.healthyC
}

func (service *exportService) Stop(_ context.Context) error {
	close(service.stopC)
	return nil
}

func (service *exportService) cycle(ctx context.Context) error {
	return runUnderLease(ctx, service.store, service.settings.Logger(), retentiontypes.LogsTTL, service.holder, leaseDuration, service.exportTables)
}

func (service *exportService) exportTables(ctx context.Context, lease *archivetypes.Lease) error {
	replicas, err := service.dialer.replicas(ctx, service.telemetryStore.ClickhouseDB(), service.telemetryStore.Cluster())
	if err != nil {
		return err
	}

	group := new(errgroup.Group)
	group.SetLimit(service.config.Limits.Concurrency)
	for _, table := range archivetypes.LogsTables() {
		service.retryIndex(ctx, replicas[firstShard(replicas)][0].conn, lease, table)

		jobs, err := service.jobs(ctx, table, replicas)
		if err != nil {
			service.settings.Logger().WarnContext(ctx, "archive export skipped a table", slog.String("table", table.Name), errors.Attr(err))
			continue
		}
		for _, job := range jobs {
			group.Go(func() error {
				if err := service.export(ctx, lease, job); err != nil && ctx.Err() == nil {
					service.settings.Logger().WarnContext(ctx, "archive export of a partition failed", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), errors.Attr(err))
				}
				return nil
			})
		}
	}

	return group.Wait()
}

// jobs returns the table's partitions past retention, on every shard.
func (service *exportService) jobs(ctx context.Context, table archivetypes.Table, replicas map[int][]replica) ([]exportJob, error) {
	conn := replicas[firstShard(replicas)][0].conn
	columns, err := exportedColumns(ctx, conn, table)
	if err != nil {
		return nil, err
	}
	mappings, err := archivetypes.NewColumnMappings(columns)
	if err != nil {
		return nil, err
	}
	version, err := schemaVersion(ctx, conn, table.Database)
	if err != nil {
		return nil, err
	}

	var jobs []exportJob
	now := time.Now()
	for shard, shardReplicas := range replicas {
		snapshots := make(map[string]map[string][]archivetypes.Part, len(shardReplicas))
		byAddr := make(map[string]replica, len(shardReplicas))
		partitionIDs := make(map[string]string)
		for _, replica := range shardReplicas {
			parts, err := activeParts(ctx, replica.conn, table)
			if err != nil {
				return nil, err
			}
			snapshots[replica.addr], byAddr[replica.addr] = parts, replica
			for id := range parts {
				partitionIDs[id] = replica.addr
			}
		}

		for id, addr := range partitionIDs {
			partition, err := service.partition(ctx, byAddr[addr].conn, table, id)
			if err != nil {
				service.settings.Logger().WarnContext(ctx, "archive export skipped a partition", slog.String("table", table.Name), slog.Int("shard", shard), slog.String("partition_id", id), errors.Attr(err))
				continue
			}
			if !partition.PastRetention(now) {
				continue
			}

			snapshot := make(map[string][]archivetypes.Part, len(snapshots))
			for addr, parts := range snapshots {
				snapshot[addr] = parts[id]
			}
			jobs = append(jobs, exportJob{table: table, mappings: mappings, version: version, partition: partition, shard: shard, replicas: byAddr, snapshot: snapshot})
		}
	}

	sort.Slice(jobs, func(i, j int) bool { return jobs[i].partition.ID < jobs[j].partition.ID })
	return jobs, nil
}

// partition caches day and retention, which never change for a partition ID.
func (service *exportService) partition(ctx context.Context, conn clickhouse.Conn, table archivetypes.Table, id string) (archivetypes.Partition, error) {
	key := table.Database + "." + table.Name + "/" + id
	service.mu.Lock()
	partition, ok := service.partitions[key]
	service.mu.Unlock()
	if ok {
		return partition, nil
	}

	partition, err := readPartition(ctx, conn, table, id)
	if err != nil {
		return partition, err
	}

	service.mu.Lock()
	service.partitions[key] = partition
	service.mu.Unlock()
	return partition, nil
}

func firstShard(replicas map[int][]replica) int {
	shards := make([]int, 0, len(replicas))
	for shard := range replicas {
		shards = append(shards, shard)
	}
	sort.Ints(shards)
	return shards[0]
}

func jobKey(job exportJob) string {
	return fmt.Sprintf("%s.%s/%d/%s", job.table.Database, job.table.Name, job.shard, job.partition.ID)
}
