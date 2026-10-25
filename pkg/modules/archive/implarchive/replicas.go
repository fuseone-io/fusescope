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

// replicas returns every replica of cluster by shard. A replica on a loopback address is the
// server the DSN names, as in a single-node cluster definition.
func (dialer *replicaDialer) replicas(ctx context.Context, conn clickhouse.Conn, cluster string) (map[int][]replica, error) {
	rows, err := conn.Query(ctx, "SELECT shard_num, host_name, host_address, port FROM system.clusters WHERE cluster = ? ORDER BY shard_num, replica_num", cluster)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't list the replicas of cluster %s", cluster)
	}
	defer rows.Close()

	byShard := make(map[int][]replica)
	for rows.Next() {
		var shard uint32
		var host, address string
		var port uint16
		if err := rows.Scan(&shard, &host, &address, &port); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
		}

		addrs := []string{net.JoinHostPort(host, strconv.Itoa(int(port)))}
		if ip := net.ParseIP(address); host == "localhost" || (ip != nil && ip.IsLoopback()) {
			addrs = dialer.options.Addr
		}
		replicaConn, err := dialer.dial(addrs)
		if err != nil {
			return nil, err
		}
		byShard[int(shard)] = append(byShard[int(shard)], replica{shard: int(shard), addr: addrs[0], conn: replicaConn})
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't read the replicas of cluster %s", cluster)
	}
	if len(byShard) == 0 {
		return nil, errors.Newf(errors.TypeNotFound, errors.CodeNotFound, "cluster %s has no replicas", cluster)
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
