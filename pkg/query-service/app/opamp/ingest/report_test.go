package ingest

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestreport"
	"github.com/gorilla/websocket"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"

	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// agentClient is an ingress collector on a raw OpAMP WebSocket: it sends
// report pages and collects the policies and acknowledgements it receives.
type agentClient struct {
	t        *testing.T
	conn     *websocket.Conn
	uid      []byte
	policies chan uint64
	acks     chan uint64
}

func dialAgent(t *testing.T, addr, authorization, uid string) *agentClient {
	t.Helper()
	return dialRaw(t, addr, authorization, uid, describe(RoleIngress, ingestpolicy.Capability))
}

// dialRaw sends hello first: its description and capabilities.
func dialRaw(t *testing.T, addr, authorization, uid string, hello *protobufs.AgentToServer) *agentClient {
	t.Helper()
	header := http.Header{}
	if authorization != "" {
		header.Set("Authorization", authorization)
	}
	conn, _, err := websocket.DefaultDialer.Dial("ws://"+addr+"/v1/opamp", header)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	conn.SetReadLimit(MaxMessageSize)
	client := &agentClient{t: t, conn: conn, uid: []byte(uid), policies: make(chan uint64, 16), acks: make(chan uint64, 16)}
	client.send(hello)
	go func() {
		for {
			_, frame, err := conn.ReadMessage()
			if err != nil {
				return
			}
			msg := new(protobufs.ServerToAgent)
			if len(frame) == 0 || frame[0] != 0 || proto.Unmarshal(frame[1:], msg) != nil {
				continue
			}
			m := msg.GetCustomMessage()
			switch {
			case m.GetCapability() != ingestpolicy.Capability:
			case m.GetType() == ingestpolicy.TypePolicy:
				if policy, err := ingestpolicy.Parse(m.GetData()); err == nil {
					client.policies <- policy.Version
				}
			case m.GetType() == ingestpolicy.TypeReportAck:
				if seq, err := ingestpolicy.ParseReportAck(m.GetData()); err == nil {
					client.acks <- seq
				}
			}
		}
	}()
	return client
}

func (c *agentClient) send(msg *protobufs.AgentToServer) {
	c.t.Helper()
	msg.InstanceUid = c.uid
	data, err := proto.Marshal(msg)
	require.NoError(c.t, err)
	require.NoError(c.t, c.conn.WriteMessage(websocket.BinaryMessage, append([]byte{0}, data...)))
}

func (c *agentClient) sendPage(page []byte) {
	c.t.Helper()
	c.send(&protobufs.AgentToServer{CustomMessage: &protobufs.CustomMessage{Capability: ingestpolicy.Capability, Type: ingestpolicy.TypeReport, Data: page}})
}

func receive(t *testing.T, ch <-chan uint64, what string) uint64 {
	t.Helper()
	select {
	case v := <-ch:
		return v
	case <-time.After(10 * time.Second):
		t.Fatalf("no %s received", what)
		return 0
	}
}

func nothing(t *testing.T, ch <-chan uint64, what string) {
	t.Helper()
	select {
	case v := <-ch:
		t.Fatalf("%s %d received", what, v)
	case <-time.After(200 * time.Millisecond):
	}
}

// reportPages is a report of n active applications and one key, in as many
// pages as it takes.
func reportPages(t *testing.T, seq, policyVersion uint64, n int) [][]byte {
	t.Helper()
	apps := make([]ingestreport.ApplicationReport, n)
	for i := range apps {
		apps[i] = ingestreport.ApplicationReport{
			ID:         fmt.Sprintf("0191c5e2-7f0a-7c3e-9a51-%012x", i),
			Counts:     ingestreport.Counts{Sessions: 1, Views: 3},
			SDK:        ingestreport.SDKReport{Name: "@fusescope/browser", Version: "0.2.0-beta.1"},
			Rejections: []ingestreport.RejectionReport{{Reason: "origin_not_allowed", Count: 2, LastOrigin: "https://staging.example.com", LastSeenAt: "2026-11-03T12:00:41Z"}},
		}
	}
	apps[0].FirstSeenAt = "2026-11-03T11:58:12Z"
	header := ingestreport.Report{
		SchemaVersion: 1, ReportSequence: seq, GeneratedAt: "2026-11-03T12:01:00Z", WindowSeconds: 300,
		Policy: ingestreport.PolicyReport{Version: policyVersion, Status: "ok"},
	}
	pages, err := ingestreport.Paginate(header, apps, []ingestreport.KeyReport{{ID: keyA, LastUsedAt: "2026-11-03T12:00:59Z"}})
	require.NoError(t, err)
	return pages
}

// A report reaches the store only from an authenticated collector, once
// every page is in, and only then is it acknowledged; a report already
// applied is acknowledged again and changes nothing.
func TestReportOverOpAMP(t *testing.T) {
	forEachStore(t, func(t *testing.T, newStore func(*testing.T) sqlstore.SQLStore) {
		tokens, err := LoadTokens(writeTokens(t, tokenA+"\n"))
		require.NoError(t, err)
		db := newStore(t)
		source := &fakeSource{}
		source.set(1)
		publisher := NewPublisher(db, source, slogDiscard())
		_, err = publisher.Revise(context.Background())
		require.NoError(t, err)
		hub := NewHub(publisher, slogDiscard())
		t.Cleanup(hub.Close)
		usage := &fakeUsage{}
		reports := NewReports(NewReportStore(db, usage), hub, publisher, slogDiscard())
		addr := startOpAMPWithReports(t, hub, reports, tokens)

		agent := dialAgent(t, addr, "Bearer "+tokenA, "0123456789abcdef")
		version := receive(t, agent.policies, "policy")
		pages := reportPages(t, 7, version, 3000)
		require.Greater(t, len(pages), 1, "a report of several pages")

		for _, page := range pages[:len(pages)-1] {
			agent.sendPage(page)
		}
		nothing(t, agent.acks, "ack before the last page")
		agent.sendPage(pages[len(pages)-1])
		assert.Equal(t, uint64(7), receive(t, agent.acks, "ack"))
		assert.Len(t, windowRows(t, db, "0123456789abcdef"), 3000)
		applied := usage.last()
		require.NotNil(t, applied)
		assert.Equal(t, time.Date(2026, 11, 3, 12, 0, 59, 0, time.UTC), applied.LastUsed[valuer.MustNewUUID(keyA)])
		nothing(t, agent.policies, "policy for a collector up to date")

		agent.sendPage(pages[0])
		assert.Equal(t, uint64(7), receive(t, agent.acks, "ack of a report already applied"))

		intruder := dialAgent(t, addr, "", "fedcba9876543210")
		for _, page := range reportPages(t, 1, version, 1) {
			intruder.sendPage(page)
		}
		nothing(t, intruder.acks, "ack without the token")
		assert.Empty(t, windowRows(t, db, "fedcba9876543210"))
	})
}

// reportFixture is a replica taking reports over a real OpAMP server, with
// one policy revised and its log in a buffer.
type reportFixture struct {
	db        sqlstore.SQLStore
	publisher *Publisher
	hub       *Hub
	reports   *Reports
	usage     *fakeUsage
	addr      string
	log       *syncBuffer
}

type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func newReportFixture(t *testing.T, db sqlstore.SQLStore) *reportFixture {
	t.Helper()
	return newReportFixtureLogging(t, db, func(h slog.Handler) slog.Handler { return h })
}

// newReportFixtureLogging logs through wrap's handler.
func newReportFixtureLogging(t *testing.T, db sqlstore.SQLStore, wrap func(slog.Handler) slog.Handler) *reportFixture {
	t.Helper()
	tokens, err := LoadTokens(writeTokens(t, tokenA+"\n"))
	require.NoError(t, err)
	source := &fakeSource{}
	source.set(1)
	f := &reportFixture{db: db, usage: &fakeUsage{}, log: &syncBuffer{}}
	logger := slog.New(wrap(slog.NewJSONHandler(f.log, &slog.HandlerOptions{Level: slog.LevelDebug})))
	f.publisher = NewPublisher(db, source, logger)
	_, err = f.publisher.Revise(context.Background())
	require.NoError(t, err)
	f.hub = NewHub(f.publisher, logger)
	t.Cleanup(f.hub.Close)
	f.reports = NewReports(NewReportStore(db, f.usage), f.hub, f.publisher, logger)
	f.addr = startOpAMPWithReports(t, f.hub, f.reports, tokens)
	return f
}

func (f *reportFixture) report(t *testing.T, agent *agentClient, seq uint64, policy ingestreport.PolicyReport) {
	t.Helper()
	page := reportPages(t, seq, policy.Version, 1)[0]
	if policy.Status != "ok" {
		require.Equal(t, 1, bytes.Count(page, []byte(`"status":"ok"`)))
		page = bytes.Replace(page, []byte(`"status":"ok"`), []byte(`"status":"`+policy.Status+`","error":"`+policy.Error+`"`), 1)
	}
	agent.sendPage(page)
}

// A collector that holds an older policy than this replica is sent it
// again, whatever it reported of the last one: a newer version may be
// accepted where an older was not. One that could not persist the current
// one gets it again too.
func TestReportResendsPolicy(t *testing.T) {
	f := newReportFixture(t, newTestStore(t))
	agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
	current := receive(t, agent.policies, "policy")

	tests := []struct {
		name   string
		policy ingestreport.PolicyReport
		resend bool
	}{
		{"up to date", ingestreport.PolicyReport{Version: current, Status: "ok"}, false},
		{"older", ingestreport.PolicyReport{Version: current - 1, Status: "ok"}, true},
		{"rejected an older one", ingestreport.PolicyReport{Version: current - 1, Status: "rejected", Error: "invalid_value"}, true},
		{"could not persist the current one", ingestreport.PolicyReport{Version: current, Status: "rejected", Error: "persist_error"}, true},
		{"rejected the current one", ingestreport.PolicyReport{Version: current, Status: "rejected", Error: "invalid_value"}, false},
	}
	for i, test := range tests {
		seq := uint64(i + 1)
		f.report(t, agent, seq, test.policy)
		assert.Equal(t, seq, receive(t, agent.acks, "ack"), test.name)
		if test.resend {
			assert.Equal(t, current, receive(t, agent.policies, "policy sent again"), test.name)
		} else {
			nothing(t, agent.policies, "policy, "+test.name)
		}
	}
}

// A report the retrier commits, after its first commit failed, is
// acknowledged through the hub, and a collector behind gets the policy.
func TestReportCommittedByRetrier(t *testing.T) {
	f := newReportFixture(t, newTestStore(t))
	agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
	current := receive(t, agent.policies, "policy")

	f.usage.mu.Lock()
	f.usage.err = errors.New("down")
	f.usage.mu.Unlock()
	f.report(t, agent, 1, ingestreport.PolicyReport{Version: current - 1, Status: "ok"})
	nothing(t, agent.acks, "ack of a report not applied")
	f.usage.mu.Lock()
	f.usage.err = nil
	f.usage.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go f.reports.Run(ctx)
	assert.Equal(t, uint64(1), receive(t, agent.acks, "ack from the retrier"))
	assert.Equal(t, current, receive(t, agent.policies, "policy sent again"))
}

// Only the agent the hub holds on the connection, an ingress collector with
// the capability within the hub's bound, has its reports read.
func TestReportOnlyFromHubAgents(t *testing.T) {
	f := newReportFixture(t, newTestStore(t))
	f.hub.maxAgents = 3 // this agent, the writer and the one without the capability
	agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
	current := receive(t, agent.policies, "policy")

	for _, other := range []struct {
		name  string
		hello *protobufs.AgentToServer
	}{
		{"writer", describe("writer", ingestpolicy.Capability)},
		{"no capability", describe(RoleIngress)},
		{"over the hub's bound", describe(RoleIngress, ingestpolicy.Capability)},
	} {
		uid := fmt.Sprintf("%-16s", other.name)[:16]
		client := dialRaw(t, f.addr, "Bearer "+tokenA, uid, other.hello)
		f.report(t, client, 1, ingestreport.PolicyReport{Version: current, Status: "ok"})
		nothing(t, client.acks, "ack, "+other.name)
		assert.Empty(t, windowRows(t, f.db, uid), other.name)
	}

	f.report(t, agent, 1, ingestreport.PolicyReport{Version: current, Status: "ok"})
	assert.Equal(t, uint64(1), receive(t, agent.acks, "ack"))
}

// The page's content never reaches the log: an invalid page and a store
// failure are logged by class.
func TestReportLogsNoContent(t *testing.T) {
	const marker = "SECRET-MARKER-41b7"
	f := newReportFixture(t, newTestStore(t))
	agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
	current := receive(t, agent.policies, "policy")

	page := reportPages(t, 1, current, 1)[0]
	agent.sendPage(bytes.Replace(page, []byte(`"windowSeconds"`), []byte(`"`+marker+`":1,"windowSeconds"`), 1))
	agent.sendPage(bytes.Replace(page, []byte(`"generatedAt"`), []byte(`"generatedAt":"x","generatedAt"`), 1))
	require.Eventually(t, func() bool { return strings.Count(f.log.String(), "ingest report page refused") >= 2 }, 5*time.Second, 10*time.Millisecond)
	assert.NotContains(t, f.log.String(), marker)
	assert.NotContains(t, f.log.String(), "generatedAt")
	assert.Contains(t, f.log.String(), `"reason":"invalid"`)
}

func (f *reportFixture) heldPolicies() int {
	f.reports.mu.Lock()
	defer f.reports.mu.Unlock()
	return len(f.reports.policies)
}

// A report invalidated by its content keeps nothing of it: its policy,
// which may be a page of text, is not held for the retrier.
func TestReportInvalidHoldsNoPolicy(t *testing.T) {
	f := newReportFixture(t, newTestStore(t))
	agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
	current := receive(t, agent.policies, "policy")

	f.report(t, agent, 1, ingestreport.PolicyReport{Version: current, Status: "rejected", Error: strings.Repeat("M", 200<<10)})
	require.Eventually(t, func() bool {
		record, err := f.reports.store.Record(context.Background(), "0123456789abcdef")
		return err == nil && record.Invalidated == 1
	}, 10*time.Second, 10*time.Millisecond, "the report is invalidated")
	nothing(t, agent.acks, "ack of an invalid report")
	assert.Zero(t, f.heldPolicies())
}

// blockingHandler blocks the log line msg until released, after saying so.
type blockingHandler struct {
	slog.Handler
	msg     string
	entered chan struct{}
	release chan struct{}
	once    *sync.Once
}

func (h blockingHandler) Handle(ctx context.Context, r slog.Record) error {
	if r.Message == h.msg {
		h.once.Do(func() { close(h.entered) })
		<-h.release
	}
	return h.Handler.Handle(ctx, r)
}

func (h blockingHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	h.Handler = h.Handler.WithAttrs(attrs)
	return h
}

// The retrier may commit a sequence while the page that failed its first
// commit is still being handled; its policy is held from before that commit,
// so a collector behind still gets the policy, and nothing stays held.
func TestReportRetrierWinsTheRace(t *testing.T) {
	for _, policy := range []func(current uint64) ingestreport.PolicyReport{
		func(current uint64) ingestreport.PolicyReport {
			return ingestreport.PolicyReport{Version: current - 1, Status: "ok"}
		},
		func(current uint64) ingestreport.PolicyReport {
			return ingestreport.PolicyReport{Version: current, Status: "rejected", Error: "persist_error"}
		},
	} {
		block := blockingHandler{msg: "ingest report not applied yet", entered: make(chan struct{}), release: make(chan struct{}), once: &sync.Once{}}
		f := newReportFixtureLogging(t, newTestStore(t), func(h slog.Handler) slog.Handler { block.Handler = h; return block })
		agent := dialAgent(t, f.addr, "Bearer "+tokenA, "0123456789abcdef")
		current := receive(t, agent.policies, "policy")

		f.usage.mu.Lock()
		f.usage.err = errors.New("down")
		f.usage.mu.Unlock()
		f.report(t, agent, 1, policy(current))
		select {
		case <-block.entered:
		case <-time.After(10 * time.Second):
			t.Fatal("the first commit did not fail")
		}
		f.usage.mu.Lock()
		f.usage.err = nil
		f.usage.mu.Unlock()

		ctx, cancel := context.WithCancel(context.Background())
		go f.reports.Run(ctx)
		assert.Equal(t, uint64(1), receive(t, agent.acks, "ack from the retrier"))
		assert.Equal(t, current, receive(t, agent.policies, "policy sent again"))
		close(block.release)
		require.Eventually(t, func() bool { return f.heldPolicies() == 0 }, 5*time.Second, 10*time.Millisecond)
		cancel()
	}
}

func TestReportPoliciesExpire(t *testing.T) {
	f := newReportFixture(t, newTestStore(t))
	f.reports.awaiting("agent", 1, ingestreport.PolicyReport{Status: "ok"})
	f.reports.expirePolicies(time.Now())
	assert.Equal(t, 1, f.heldPolicies())
	f.reports.expirePolicies(time.Now().Add(ingestreport.CommitDeadline + retryEvery + time.Second))
	assert.Zero(t, f.heldPolicies(), "a sequence the retrier invalidated at its deadline leaves")
	f.reports.awaiting("agent", 2, ingestreport.PolicyReport{Status: "ok"})
	f.reports.forget("agent", 1)
	assert.Equal(t, 1, f.heldPolicies(), "only the sequence held is forgotten")
	f.reports.forget("agent", 2)
	assert.Zero(t, f.heldPolicies())
}
