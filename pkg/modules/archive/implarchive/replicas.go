package implarchive

import (
	"context"
	"net"
	"strconv"
	"sync"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

// replica is one server of the cluster, reached directly: reads through Distributed tables
// can land on a lagging replica (ADR 0002, E8).
type replica struct {
	shard int
	addr  string
	conn  clickhouse.Conn
}

// replicaDialer keeps one connection per replica, with the credentials and TLS of the
// telemetry store DSN.
type replicaDialer struct {
	options *clickhouse.Options
	mu      sync.Mutex
	conns   map[string]clickhouse.Conn
}

func newReplicaDialer(dsn string, maxConns int) (*replicaDialer, error) {
	options, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "couldn't parse the telemetry store DSN")
	}
	options.MaxOpenConns = maxConns
	options.MaxIdleConns = maxConns
	if options.Settings == nil {
		options.Settings = clickhouse.Settings{}
	}
	options.Settings["use_hedged_requests"] = 0

	return &replicaDialer{options: options, conns: make(map[string]clickhouse.Conn)}, nil
}

type clusterReplica struct {
	shard   int
	host    string
	port    uint16
	isLocal bool
}

// replicas returns every replica of cluster by shard.
func (dialer *replicaDialer) replicas(ctx context.Context, conn clickhouse.Conn, cluster string) (map[int][]replica, error) {
	rows, err := conn.Query(ctx, "SELECT shard_num, host_name, port, is_local FROM system.clusters WHERE cluster = ? ORDER BY shard_num, replica_num", cluster)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the replicas of cluster %s", cluster)
	}
	defer rows.Close()

	var listed []clusterReplica
	for rows.Next() {
		var shard uint32
		var host string
		var port uint16
		var isLocal uint8
		if err := rows.Scan(&shard, &host, &port, &isLocal); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
		}
		listed = append(listed, clusterReplica{shard: int(shard), host: host, port: port, isLocal: isLocal == 1})
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
	}

	resolved, err := resolveReplicas(listed, dialer.options.Addr)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "couldn't resolve the replicas of cluster %s", cluster)
	}

	byShard := make(map[int][]replica, len(resolved))
	for shard, shardAddrs := range resolved {
		for _, addrs := range shardAddrs {
			replicaConn, err := dialer.dial(addrs)
			if err != nil {
				return nil, err
			}
			byShard[shard] = append(byShard[shard], replica{shard: shard, addr: addrs[0], conn: replicaConn})
		}
	}

	return byShard, nil
}

// resolveReplicas returns the addresses to dial for each replica, by shard. The server the
// DSN names lists itself as local, under whatever host the cluster definition gives it. A
// server in two shards would export the same parts once per shard.
func resolveReplicas(listed []clusterReplica, dsnAddrs []string) (map[int][][]string, error) {
	resolved := make(map[int][][]string)
	shardOf := make(map[string]int)
	for _, listedReplica := range listed {
		addrs := []string{net.JoinHostPort(listedReplica.host, strconv.Itoa(int(listedReplica.port)))}
		if listedReplica.isLocal {
			addrs = dsnAddrs
		}

		if shard, ok := shardOf[addrs[0]]; ok {
			if shard != listedReplica.shard {
				return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "replica %s is in shards %d and %d", addrs[0], shard, listedReplica.shard)
			}
			continue
		}
		shardOf[addrs[0]] = listedReplica.shard
		resolved[listedReplica.shard] = append(resolved[listedReplica.shard], addrs)
	}
	if len(resolved) == 0 {
		return nil, errors.New(errors.TypeNotFound, errors.CodeNotFound, "the cluster has no replicas")
	}

	return resolved, nil
}

func (dialer *replicaDialer) close() {
	dialer.mu.Lock()
	defer dialer.mu.Unlock()

	for addr, conn := range dialer.conns {
		_ = conn.Close()
		delete(dialer.conns, addr)
	}
}

func (dialer *replicaDialer) dial(addrs []string) (clickhouse.Conn, error) {
	dialer.mu.Lock()
	defer dialer.mu.Unlock()

	if conn, ok := dialer.conns[addrs[0]]; ok {
		return conn, nil
	}

	options := *dialer.options
	options.Addr = addrs
	conn, err := clickhouse.Open(&options)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't connect to replica %s", addrs[0])
	}
	dialer.conns[addrs[0]] = conn
	return conn, nil
}
