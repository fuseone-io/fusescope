package opamp

import (
	"context"
	"crypto/tls"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/open-telemetry/opamp-go/server"
)

const (
	// ingestHandshakeTimeout bounds the TLS handshake and the request
	// headers of a connection to the ingest listener.
	ingestHandshakeTimeout = 10 * time.Second
	// ingestIdleTimeout closes a connection that sends nothing for that
	// long; a collector's heartbeat is every 30 s.
	ingestIdleTimeout = 5 * time.Minute
	// maxIngestConnections bounds the connections held on the ingest
	// listener, from their accept, in handshake or not: twice the hub's
	// ingress agents, for reconnections.
	maxIngestConnections = 512
)

// ingestLimits are the bounds of the ingest listener, overridable in tests.
type ingestLimits struct {
	handshake, idle time.Duration
	connections     int
}

var defaultIngestLimits = ingestLimits{handshake: ingestHandshakeTimeout, idle: ingestIdleTimeout, connections: maxIngestConnections}

// ingestListener serves OpAMP to ingress collectors with TLS. Unlike the
// plaintext listener it admits only a WebSocket that presents an ingest
// token, and it bounds connections from their accept.
type ingestListener struct {
	http     *http.Server
	listener net.Listener
}

// startIngestListener serves handler, opamp-go's, on listen with tlsConfig.
func startIngestListener(listen string, tlsConfig *tls.Config, handler server.HTTPHandlerFunc, connContext server.ConnContext, limits ingestLimits) (*ingestListener, error) {
	tcp, err := net.Listen("tcp", listen)
	if err != nil {
		return nil, err
	}
	listener := &limitedListener{Listener: tcp, slots: make(chan struct{}, limits.connections), done: make(chan struct{}), idle: limits.idle}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/opamp", func(w http.ResponseWriter, r *http.Request) {
		// Ingress collectors use the WebSocket transport, which the hub
		// needs to push the policy.
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			http.Error(w, "WebSocket only", http.StatusBadRequest)
			return
		}
		handler(w, r)
	})
	server := &http.Server{
		Handler:           mux,
		TLSConfig:         tlsConfig,
		ConnContext:       connContext,
		ReadHeaderTimeout: limits.handshake, // also the TLS handshake's
		IdleTimeout:       limits.handshake,
		// A failed handshake is the client's; it is not logged per attempt.
		ErrorLog: log.New(io.Discard, "", 0),
	}
	go func() { _ = server.ServeTLS(listener, "", "") }()
	return &ingestListener{http: server, listener: listener}, nil
}

func (l *ingestListener) Addr() net.Addr { return l.listener.Addr() }

func (l *ingestListener) Stop(ctx context.Context) error {
	return l.http.Shutdown(ctx)
}

// limitedListener holds at most cap(slots) connections; Accept waits for a
// slot. Each connection closes after idle without a byte read.
type limitedListener struct {
	net.Listener
	slots chan struct{}
	done  chan struct{}
	once  sync.Once
	idle  time.Duration
}

func (l *limitedListener) Accept() (net.Conn, error) {
	select {
	case l.slots <- struct{}{}:
	case <-l.done:
		return nil, net.ErrClosed
	}
	conn, err := l.Listener.Accept()
	if err != nil {
		<-l.slots
		return nil, err
	}
	return newIdleConn(conn, l.idle, func() { <-l.slots }), nil
}

func (l *limitedListener) Close() error {
	l.once.Do(func() { close(l.done) })
	return l.Listener.Close()
}

// idleConn closes after idle without a byte read. It never sets a deadline
// on the connection: the HTTP server sets its own for the handshake and the
// headers, and moves them while it hands the connection to the WebSocket.
type idleConn struct {
	net.Conn
	idle    time.Duration
	timer   *time.Timer
	release func()
	closed  sync.Once
}

func newIdleConn(conn net.Conn, idle time.Duration, release func()) *idleConn {
	c := &idleConn{Conn: conn, idle: idle, release: release}
	c.timer = time.AfterFunc(idle, func() { _ = c.Close() })
	return c
}

func (c *idleConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.timer.Reset(c.idle)
	}
	return n, err
}

func (c *idleConn) Close() error {
	err := c.Conn.Close()
	c.closed.Do(func() {
		c.timer.Stop()
		c.release()
	})
	return err
}
