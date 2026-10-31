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
	shard   int
	replica int
	addr    string
	conn    clickhouse.Conn
}

// replicaDialer keeps one connection per replica, with the credentials and TLS of the
// telemetry store DSN.
type replicaDialer struct {
	options *clickhouse.Options
	open    func(options *clickhouse.Options) (clickhouse.Conn, error)
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

	return &replicaDialer{options: options, open: clickhouse.Open, conns: make(map[string]clickhouse.Conn)}, nil
}

type clusterReplica struct {
	shard   int
	replica int
	host    string
	address string
	port    uint16
}

type resolvedReplica struct {
	replica int
	addrs   []string
}

// replicas returns every replica of cluster by shard, and disconnects the replicas no longer
// in it.
func (dialer *replicaDialer) replicas(ctx context.Context, conn clickhouse.Conn, cluster string) (map[int][]replica, error) {
	rows, err := conn.Query(ctx, "SELECT shard_num, replica_num, host_name, host_address, port FROM system.clusters WHERE cluster = ? ORDER BY shard_num, replica_num", cluster)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the replicas of cluster %s", cluster)
	}
	defer rows.Close()

	var listed []clusterReplica
	for rows.Next() {
		var shard, replicaNum uint32
		var host, address string
		var port uint16
		if err := rows.Scan(&shard, &replicaNum, &host, &address, &port); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
		}
		listed = append(listed, clusterReplica{shard: int(shard), replica: int(replicaNum), host: host, address: address, port: port})
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
	}

	resolved, err := resolveReplicas(listed, dialer.options.Addr)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "couldn't resolve the replicas of cluster %s", cluster)
	}

	return dialer.connect(resolved)
}

// resolveReplicas returns the addresses to dial for each replica, by shard: the host and port
// the cluster lists, as the DSN may name a load balancer over every server. A loopback replica
// is the single server of a local setup, reached at the DSN. A server in two shards would
// export the same parts once per shard.
func resolveReplicas(listed []clusterReplica, dsnAddrs []string) (map[int][]resolvedReplica, error) {
	resolved := make(map[int][]resolvedReplica)
	shardOf := make(map[string]int)
	for _, listedReplica := range listed {
		addrs := []string{net.JoinHostPort(listedReplica.host, strconv.Itoa(int(listedReplica.port)))}
		if ip := net.ParseIP(listedReplica.address); listedReplica.host == "localhost" || (ip != nil && ip.IsLoopback()) {
			addrs = dsnAddrs
		}

		if shard, ok := shardOf[addrs[0]]; ok {
			if shard != listedReplica.shard {
				return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "replica %s is in shards %d and %d", addrs[0], shard, listedReplica.shard)
			}
			continue
		}
		shardOf[addrs[0]] = listedReplica.shard
		resolved[listedReplica.shard] = append(resolved[listedReplica.shard], resolvedReplica{replica: listedReplica.replica, addrs: addrs})
	}
	if len(resolved) == 0 {
		return nil, errors.New(errors.TypeNotFound, errors.CodeNotFound, "the cluster has no replicas")
	}

	return resolved, nil
}

func (dialer *replicaDialer) connect(resolved map[int][]resolvedReplica) (map[int][]replica, error) {
	dialer.mu.Lock()
	defer dialer.mu.Unlock()

	listed := make(map[string]bool)
	byShard := make(map[int][]replica, len(resolved))
	for shard, shardReplicas := range resolved {
		for _, resolvedReplica := range shardReplicas {
			replicaConn, err := dialer.dial(resolvedReplica.addrs)
			if err != nil {
				return nil, err
			}
			listed[resolvedReplica.addrs[0]] = true
			byShard[shard] = append(byShard[shard], replica{shard: shard, replica: resolvedReplica.replica, addr: resolvedReplica.addrs[0], conn: replicaConn})
		}
	}

	for addr, conn := range dialer.conns {
		if !listed[addr] {
			_ = conn.Close()
			delete(dialer.conns, addr)
		}
	}
	return byShard, nil
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
	if conn, ok := dialer.conns[addrs[0]]; ok {
		return conn, nil
	}

	options := *dialer.options
	options.Addr = addrs
	conn, err := dialer.open(&options)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't connect to replica %s", addrs[0])
	}
	dialer.conns[addrs[0]] = conn
	return conn, nil
}
