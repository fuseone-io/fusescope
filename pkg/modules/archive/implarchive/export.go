package implarchive

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
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

	mu         sync.Mutex
	partitions map[string]archivetypes.Partition
	firstSeen  map[string][]archivetypes.Part
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
	ctx, cancel := context.WithTimeout(ctx, service.config.Logs.CycleTimeout())
	defer cancel()

	return runUnderLease(ctx, service.store, service.settings.Logger(), retentiontypes.LogsTTL, service.holder, leaseDuration, service.exportTables)
}

func (service *exportService) exportTables(ctx context.Context, lease *archivetypes.Lease) error {
	replicas, err := service.dialer.replicas(ctx, service.telemetryStore.ClickhouseDB(), service.telemetryStore.Cluster())
	if err != nil {
		return err
	}

	indexConns := make(map[archivetypes.Table]clickhouse.Conn)
	group := new(errgroup.Group)
	group.SetLimit(service.config.Limits.Concurrency)
	for _, table := range archivetypes.LogsTables() {
		jobs, conn, err := service.jobs(ctx, table, replicas)
		if err != nil {
			service.settings.Logger().WarnContext(ctx, "archive export skipped a table", slog.String("table", table.Name), errors.Attr(err))
			continue
		}
		indexConns[table] = conn

		for _, job := range jobs {
			group.Go(func() error {
				if err := service.export(ctx, lease, job); err != nil && ctx.Err() == nil {
					service.settings.Logger().WarnContext(ctx, "archive export of a partition failed", slog.String("table", job.table.Name), slog.Int("shard", job.shard), slog.String("partition_id", job.partition.ID), errors.Attr(err))
				}
				return nil
			})
		}
	}
	if err := group.Wait(); err != nil {
		return err
	}

	for _, table := range archivetypes.LogsTables() {
		if conn, ok := indexConns[table]; ok {
			service.syncIndex(ctx, conn, lease, table)
		}
	}
	return nil
}

// jobs returns the table's partitions past retention on every shard that a replica answers
// for, and a connection to one of them.
func (service *exportService) jobs(ctx context.Context, table archivetypes.Table, replicas map[int][]replica) ([]exportJob, clickhouse.Conn, error) {
	shards, err := service.snapshotShards(ctx, table, replicas)
	if err != nil {
		return nil, nil, err
	}

	conn := shards[0].replicas[shards[0].firstAddr].conn
	columns, err := exportedColumns(ctx, conn, table)
	if err != nil {
		return nil, nil, err
	}
	mappings, err := archivetypes.NewColumnMappings(columns)
	if err != nil {
		return nil, nil, err
	}
	version, err := schemaVersion(ctx, conn, table.Database)
	if err != nil {
		return nil, nil, err
	}

	var jobs []exportJob
	now := time.Now()
	for _, shard := range shards {
		for id, addr := range shard.partitionIDs {
			partition, err := service.partition(ctx, shard.replicas[addr].conn, table, id)
			if err != nil {
				service.settings.Logger().WarnContext(ctx, "archive export skipped a partition", slog.String("table", table.Name), slog.Int("shard", shard.shard), slog.String("partition_id", id), errors.Attr(err))
				continue
			}
			if !partition.PastRetention(now) {
				continue
			}

			snapshot := make(map[string][]archivetypes.Part, len(shard.parts))
			for addr, parts := range shard.parts {
				snapshot[addr] = parts[id]
			}
			jobs = append(jobs, exportJob{table: table, mappings: mappings, version: version, partition: partition, shard: shard.shard, replicas: shard.replicas, snapshot: snapshot})
		}
	}

	sort.Slice(jobs, func(i, j int) bool { return jobs[i].partition.ID < jobs[j].partition.ID })
	return jobs, conn, nil
}

// snapshotShards returns the snapshot of every shard that can be archived, each pinned to its
// replica path. A table that isn't replicated has no path to tell its shards apart by, so it is
// only archived on a single-server cluster.
func (service *exportService) snapshotShards(ctx context.Context, table archivetypes.Table, replicas map[int][]replica) ([]shardSnapshot, error) {
	servers := 0
	for _, shardReplicas := range replicas {
		servers += len(shardReplicas)
	}

	shards := make([]shardSnapshot, 0, len(replicas))
	for _, shard := range sortedShards(replicas) {
		snapshot, err := service.snapshotShard(ctx, table, shard, replicas[shard])
		if err == nil && !snapshot.replicated && servers > 1 {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s isn't replicated, so its shards can't be told apart; it can only be archived on a single-server cluster", table.Name)
		}
		if err == nil && snapshot.replicated {
			err = service.store.PinShard(ctx, table.Name, shard, snapshot.path)
		}
		if err != nil {
			service.settings.Logger().WarnContext(ctx, "archive export skipped a shard", slog.String("table", table.Name), slog.Int("shard", shard), errors.Attr(err))
			continue
		}
		shards = append(shards, snapshot)
	}
	if len(shards) == 0 {
		return nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "no shard of %s can be archived", table.Name)
	}

	return shards, nil
}

// shardSnapshot is the active parts of a table on the replicas of a shard that answered, and
// the replica path they agree on.
type shardSnapshot struct {
	shard        int
	firstAddr    string
	replicated   bool
	path         string
	replicas     map[string]replica
	parts        map[string]map[string][]archivetypes.Part
	partitionIDs map[string]string
}

// snapshotShard reads the parts on every replica of shard it can reach. A replica that
// doesn't answer, that turns out to be another server or that lacks the table is left out:
// ranges only it holds stay uncovered and are exported later. The replicas left must agree on
// the shard's replica path.
func (service *exportService) snapshotShard(ctx context.Context, table archivetypes.Table, shard int, shardReplicas []replica) (shardSnapshot, error) {
	snapshot := shardSnapshot{shard: shard, replicas: make(map[string]replica), parts: make(map[string]map[string][]archivetypes.Part), partitionIDs: make(map[string]string)}
	for _, replica := range shardReplicas {
		inspected, parts, err := service.readReplica(ctx, table, replica)
		if err != nil {
			service.settings.Logger().WarnContext(ctx, "archive export skipped a replica", slog.String("table", table.Name), slog.Int("shard", shard), slog.String("replica", replica.addr), errors.Attr(err))
			continue
		}

		if snapshot.firstAddr == "" {
			snapshot.firstAddr, snapshot.path, snapshot.replicated = replica.addr, inspected.path, inspected.path != ""
		} else if inspected.path != snapshot.path {
			return snapshot, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "replicas of shard %d disagree on the replica path of %s: %q and %q", shard, table.Name, snapshot.path, inspected.path)
		}
		snapshot.replicas[replica.addr], snapshot.parts[replica.addr] = replica, parts
		for id := range parts {
			snapshot.partitionIDs[id] = replica.addr
		}
	}
	if snapshot.firstAddr == "" {
		return snapshot, errors.Newf(errors.TypeInternal, errors.CodeInternal, "no replica of shard %d answered", shard)
	}

	return snapshot, nil
}

func (service *exportService) readReplica(ctx context.Context, table archivetypes.Table, replica replica) (replicaTable, map[string][]archivetypes.Part, error) {
	inspected, err := inspectReplica(ctx, replica.conn, service.telemetryStore.Cluster(), replica.shard, replica.replica, table)
	if err != nil {
		return inspected, nil, err
	}
	if !inspected.isReplica {
		return inspected, nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "%s answered as a server other than replica %d of shard %d", replica.addr, replica.replica, replica.shard)
	}
	if inspected.engine == "" {
		return inspected, nil, errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "%s.%s doesn't exist on the replica yet", table.Database, table.Name)
	}
	if strings.HasPrefix(inspected.engine, "Replicated") && inspected.path == "" {
		return inspected, nil, errors.Newf(errors.TypeInternal, errors.CodeInternal, "%s.%s has no replica path yet", table.Database, table.Name)
	}

	parts, err := activeParts(ctx, replica.conn, table)
	return inspected, parts, err
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

func sortedShards(replicas map[int][]replica) []int {
	shards := make([]int, 0, len(replicas))
	for shard := range replicas {
		shards = append(shards, shard)
	}
	sort.Ints(shards)
	return shards
}

func jobKey(job exportJob) string {
	return fmt.Sprintf("%s.%s/%d/%s", job.table.Database, job.table.Name, job.shard, job.partition.ID)
}
