package model

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/types/opamptypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type recordingConn struct {
	mu   sync.Mutex
	sent []*protobufs.ServerToAgent
	err  error
	// Whether each Send got a context with a deadline.
	deadlines []bool
}

func (c *recordingConn) Connection() net.Conn { return nil }
func (c *recordingConn) Disconnect() error    { return nil }
func (c *recordingConn) Send(ctx context.Context, msg *protobufs.ServerToAgent) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, ok := ctx.Deadline()
	c.deadlines = append(c.deadlines, ok)
	if c.err != nil {
		return c.err
	}
	c.sent = append(c.sent, msg)
	return nil
}

func (c *recordingConn) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.sent)
}

// fixedConfigProvider recommends the same configuration to every agent and
// records the deployments started.
type fixedConfigProvider struct {
	config string
	id     string // log_pipelines:1 when empty

	mu        sync.Mutex
	initiated []string
}

func (p *fixedConfigProvider) RecommendAgentConfig(valuer.UUID, []byte) (*opamptypes.ConfigRecommendation, error) {
	id := p.id
	if id == "" {
		id = "log_pipelines:1"
	}
	return &opamptypes.ConfigRecommendation{Config: []byte(p.config), ID: id}, nil
}
func (p *fixedConfigProvider) ReportConfigDeploymentInitiated(_ valuer.UUID, recommendation *opamptypes.ConfigRecommendation) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.initiated = append(p.initiated, recommendation.ID)
	return nil
}
func (*fixedConfigProvider) ReportConfigDeploymentStatus(valuer.UUID, string, string, error) {}
func (*fixedConfigProvider) GetDeployStatusByHash(context.Context, valuer.UUID, string) (opamptypes.DeployStatus, error) {
	return opamptypes.DeployStatusUnknown, nil
}

func (p *fixedConfigProvider) initiatedCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.initiated)
}

func newTestAgents(t *testing.T, configs map[string]string) (*Agents, map[string]*recordingConn) {
	t.Helper()
	orgID := valuer.GenerateUUID()
	agents := &Agents{agentsById: map[string]*Agent{}, connections: map[types.Connection]map[string]bool{}, logger: slog.Default()}
	conns := map[string]*recordingConn{}
	for id, config := range configs {
		conn := &recordingConn{}
		agent := New(nil, slog.Default(), orgID, id, conn)
		agent.Config = config
		agents.agentsById[id] = agent
		conns[id] = conn
	}
	return agents, conns
}

// #261: the broadcast stopped at the first agent whose configuration was
// unchanged, so the agents after it in map order got no push.
func TestRecommendLatestConfigToAllPushesEveryChangedAgent(t *testing.T) {
	const recommended = "receivers: {otlp: {}}\n"
	configs := map[string]string{"agent-00": recommended}
	for i := 1; i <= 20; i++ {
		configs[fmt.Sprintf("agent-%02d", i)] = "receivers: {}\n"
	}
	agents, conns := newTestAgents(t, configs)
	provider := &fixedConfigProvider{config: recommended}

	// Map order is random: over several broadcasts the unchanged agent
	// comes before some changed one almost surely.
	const broadcasts = 5
	for range broadcasts {
		require.NoError(t, agents.RecommendLatestConfigToAll(provider))
	}

	for id, conn := range conns {
		if id == "agent-00" {
			assert.Zero(t, conn.count(), "an unchanged agent gets no push")
			continue
		}
		assert.Equal(t, broadcasts, conn.count(), "pushes to %s", id)
		assert.NotContains(t, conn.deadlines, false, "each send to %s is bounded", id)
	}
	assert.Equal(t, 20*broadcasts, provider.initiatedCount(), "one deployment started per push")
}

func TestRecommendLatestConfigToAll(t *testing.T) {
	testCases := []struct {
		name          string
		recommended   string
		effective     string
		sendErr       error
		wantPushes    int
		wantInitiated int
		wantErr       bool
	}{
		{name: "changed", recommended: "receivers: {otlp: {}}\n", effective: "receivers: {}\n", wantPushes: 1, wantInitiated: 1},
		{name: "same document, other formatting", recommended: "receivers:\n  otlp: {}\n", effective: "receivers: {otlp: {}}\n"},
		{name: "send fails", recommended: "receivers: {otlp: {}}\n", effective: "receivers: {}\n", sendErr: errors.New("closed"), wantErr: true},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			agents, conns := newTestAgents(t, map[string]string{"failing": tc.effective, "other": "receivers: {}\n"})
			conns["failing"].err = tc.sendErr
			provider := &fixedConfigProvider{config: tc.recommended}

			err := agents.RecommendLatestConfigToAll(provider)
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, tc.wantPushes, conns["failing"].count())
			assert.Equal(t, 1, conns["other"].count(), "the other agent gets its push")
			assert.Equal(t, tc.wantInitiated+1, provider.initiatedCount(), "a deployment starts only with a push sent")
		})
	}
}

// #261: an agent that reconnected with a config already applied got no
// push until the next settings change, even when the settings had changed
// while it was away.
func TestReconnectedAgentIsReconciled(t *testing.T) {
	testCases := []struct {
		name          string
		effective     string
		recommended   string
		wantPushes    int
		wantInitiated int
	}{
		{name: "settings changed while away", effective: "receivers: {}\n", recommended: "receivers: {otlp: {}}\n", wantPushes: 1, wantInitiated: 1},
		{name: "settings unchanged", effective: "receivers: {otlp: {}}\n", recommended: "receivers:\n  otlp: {}\n"},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			conn := &recordingConn{}
			agent := New(nil, slog.Default(), valuer.GenerateUUID(), "agent", conn)
			provider := &fixedConfigProvider{config: tc.recommended}

			agent.UpdateStatus(&protobufs.AgentToServer{
				SequenceNum:      7,
				AgentDescription: &protobufs.AgentDescription{},
				Capabilities:     uint64(protobufs.AgentCapabilities_AgentCapabilities_ReportsEffectiveConfig),
				EffectiveConfig: &protobufs.EffectiveConfig{ConfigMap: &protobufs.AgentConfigMap{ConfigMap: map[string]*protobufs.AgentConfigObject{
					CollectorConfigFilename: {Body: []byte(tc.effective)},
				}}},
				RemoteConfigStatus: &protobufs.RemoteConfigStatus{
					Status:               protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED,
					LastRemoteConfigHash: []byte("log_pipelines:0"),
				},
			}, &protobufs.ServerToAgent{}, provider)

			assert.Equal(t, tc.wantPushes, conn.count())
			assert.Equal(t, tc.wantInitiated, provider.initiatedCount())
		})
	}
}

// blockingConn's Send ignores its context, as opamp-go's WebSocket
// connection does, and returns only once Disconnect is called.
type blockingConn struct {
	once         sync.Once
	disconnected chan struct{}
	sends        atomic.Int32
}

func newBlockingConn() *blockingConn { return &blockingConn{disconnected: make(chan struct{})} }

func (c *blockingConn) Connection() net.Conn { return nil }
func (c *blockingConn) Disconnect() error {
	c.once.Do(func() { close(c.disconnected) })
	return nil
}
func (c *blockingConn) Send(context.Context, *protobufs.ServerToAgent) error {
	c.sends.Add(1)
	<-c.disconnected
	return errors.New("use of closed connection")
}

func withSendTimeout(t *testing.T, timeout time.Duration) {
	t.Helper()
	previous := sendTimeout
	sendTimeout = timeout
	t.Cleanup(func() { sendTimeout = previous })
}

// Review of #318: the send's context alone bounded nothing, since the
// WebSocket connection ignores it.
func TestSendToAgentDisconnectsABlockedAgent(t *testing.T) {
	withSendTimeout(t, 50*time.Millisecond)
	conn := newBlockingConn()
	agent := New(nil, slog.Default(), valuer.GenerateUUID(), "agent", conn)

	start := time.Now()
	err := agent.SendToAgent(&protobufs.ServerToAgent{})
	require.Error(t, err)
	assert.Less(t, time.Since(start), time.Second)
	select {
	case <-conn.disconnected:
	default:
		t.Fatal("the blocked agent is disconnected")
	}

	require.Error(t, agent.SendToAgent(&protobufs.ServerToAgent{}), "a disconnected agent fails at once")
	assert.Equal(t, int32(1), conn.sends.Load(), "no second send on a dead connection")
}

// Review of #318: slow agents are pushed to concurrently, not one timeout
// after another.
func TestRecommendLatestConfigToAllWithSlowAgents(t *testing.T) {
	const timeout = 200 * time.Millisecond
	withSendTimeout(t, timeout)
	agents, conns := newTestAgents(t, map[string]string{"fast": "receivers: {}\n"})
	orgID := agents.agentsById["fast"].OrgID
	for i := range 8 {
		id := fmt.Sprintf("slow-%d", i)
		agent := New(nil, slog.Default(), orgID, id, newBlockingConn())
		agent.Config = "receivers: {}\n"
		agents.agentsById[id] = agent
	}
	provider := &fixedConfigProvider{config: "receivers: {otlp: {}}\n"}

	start := time.Now()
	err := agents.RecommendLatestConfigToAll(provider)
	elapsed := time.Since(start)

	require.Error(t, err, "the slow agents' timeouts are returned")
	assert.Less(t, elapsed, 4*timeout, "8 slow agents cost about one timeout, not eight")
	assert.Equal(t, 1, conns["fast"].count())
	assert.Equal(t, 1, provider.initiatedCount(), "only the push that was sent starts a deployment")
}

// flakyProvider fails its first recommendation and its first
// ReportConfigDeploymentInitiated, and records the order of calls.
type flakyProvider struct {
	fixedConfigProvider
	recommendFailures, initiatedFailures int
	events                               []string
}

func (p *flakyProvider) RecommendAgentConfig(org valuer.UUID, conf []byte) (*opamptypes.ConfigRecommendation, error) {
	if p.recommendFailures > 0 {
		p.recommendFailures--
		return nil, errors.New("database unavailable")
	}
	return p.fixedConfigProvider.RecommendAgentConfig(org, conf)
}
func (p *flakyProvider) ReportConfigDeploymentInitiated(org valuer.UUID, recommendation *opamptypes.ConfigRecommendation) error {
	if p.initiatedFailures > 0 {
		p.initiatedFailures--
		p.events = append(p.events, "initiated failed "+recommendation.ID)
		return errors.New("database unavailable")
	}
	p.events = append(p.events, "initiated "+recommendation.ID)
	return p.fixedConfigProvider.ReportConfigDeploymentInitiated(org, recommendation)
}
func (p *flakyProvider) ReportConfigDeploymentStatus(_ valuer.UUID, _ string, configID string, err error) {
	p.events = append(p.events, fmt.Sprintf("status %s ok=%v", configID, err == nil))
}

func reconnectStatus(seq uint64, effective string, hash string) *protobufs.AgentToServer {
	status := &protobufs.AgentToServer{
		SequenceNum:  seq,
		Capabilities: uint64(protobufs.AgentCapabilities_AgentCapabilities_ReportsEffectiveConfig),
		RemoteConfigStatus: &protobufs.RemoteConfigStatus{
			Status:               protobufs.RemoteConfigStatuses_RemoteConfigStatuses_APPLIED,
			LastRemoteConfigHash: []byte(hash),
		},
	}
	if effective != "" {
		status.AgentDescription = &protobufs.AgentDescription{}
		status.EffectiveConfig = &protobufs.EffectiveConfig{ConfigMap: &protobufs.AgentConfigMap{ConfigMap: map[string]*protobufs.AgentConfigObject{
			CollectorConfigFilename: {Body: []byte(effective)},
		}}}
	}
	return status
}

// Review of #318: a failed recommendation at reconnect dropped the
// reconciliation for good.
func TestReconnectReconciliationRetriesAfterAFailure(t *testing.T) {
	conn := &recordingConn{}
	agent := New(nil, slog.Default(), valuer.GenerateUUID(), "agent", conn)
	provider := &flakyProvider{fixedConfigProvider: fixedConfigProvider{config: "receivers: {otlp: {}}\n"}, recommendFailures: 1}

	agent.UpdateStatus(reconnectStatus(7, "receivers: {}\n", "log_pipelines:0"), &protobufs.ServerToAgent{}, provider)
	assert.Zero(t, conn.count(), "the recommendation failed")

	agent.UpdateStatus(reconnectStatus(8, "", "log_pipelines:0"), &protobufs.ServerToAgent{}, provider)
	assert.Equal(t, 1, conn.count(), "the next message retries the reconciliation")
}

// Review of #318: a failure to record the deployment as started was
// dropped, so the agent's ack found no row to update.
func TestDeploymentInitiatedIsRetriedBeforeTheAck(t *testing.T) {
	conn := &recordingConn{}
	orgID := valuer.GenerateUUID()
	agent := New(nil, slog.Default(), orgID, "agent-initiated", conn)
	provider := &flakyProvider{fixedConfigProvider: fixedConfigProvider{config: "receivers: {otlp: {}}\n"}, initiatedFailures: 1}

	agent.UpdateStatus(reconnectStatus(7, "receivers: {}\n", "log_pipelines:0"), &protobufs.ServerToAgent{}, provider)
	require.Equal(t, 1, conn.count(), "the config is pushed")

	agent.UpdateStatus(reconnectStatus(8, "", "log_pipelines:1"), &protobufs.ServerToAgent{}, provider)
	assert.Equal(t, []string{
		// The reconnect reconciles the status of what the agent already applied.
		"status " + orgID.String() + "log_pipelines:0 ok=true",
		"initiated failed log_pipelines:1",
		"initiated log_pipelines:1",
		"status " + orgID.String() + "log_pipelines:1 ok=true",
	}, provider.events)
}

// Review of #318: while recording the deployment keeps failing, the agent's
// ack is neither handled nor stored, and its full state is asked for, so
// the ack comes again once the deployment is recorded.
func TestAckWaitsForTheDeploymentToBeRecorded(t *testing.T) {
	conn := &recordingConn{}
	orgID := valuer.GenerateUUID()
	agent := New(nil, slog.Default(), orgID, "agent-ack", conn)
	provider := &flakyProvider{fixedConfigProvider: fixedConfigProvider{config: "receivers: {otlp: {}}\n"}, initiatedFailures: 2}

	agent.UpdateStatus(reconnectStatus(7, "receivers: {}\n", "log_pipelines:0"), &protobufs.ServerToAgent{}, provider)
	require.Equal(t, 1, conn.count(), "the config is pushed")

	response := &protobufs.ServerToAgent{}
	agent.UpdateStatus(reconnectStatus(8, "", "log_pipelines:1"), response, provider)
	assert.NotZero(t, response.Flags&uint64(protobufs.ServerToAgentFlags_ServerToAgentFlags_ReportFullState), "the agent is asked for its full state")

	agent.UpdateStatus(reconnectStatus(9, "", "log_pipelines:1"), &protobufs.ServerToAgent{}, provider)
	assert.Equal(t, []string{
		"status " + orgID.String() + "log_pipelines:0 ok=true",
		"initiated failed log_pipelines:1",
		"initiated failed log_pipelines:1",
		"initiated log_pipelines:1",
		"status " + orgID.String() + "log_pipelines:1 ok=true",
	}, provider.events)
}

// Review of #318: a second push before the agent's next status cleared the
// first one's unrecorded deployment.
func TestUnrecordedDeploymentSurvivesTheNextPush(t *testing.T) {
	testCases := []struct {
		name              string
		initiatedFailures int
		wantPushes        int
		wantEvents        []string
	}{
		{
			name: "recorded before the next push", initiatedFailures: 1, wantPushes: 2,
			wantEvents: []string{"initiated failed log_pipelines:1", "initiated log_pipelines:1", "initiated log_pipelines:2"},
		},
		{
			name: "still failing: the next push waits", initiatedFailures: 2, wantPushes: 1,
			wantEvents: []string{"initiated failed log_pipelines:1", "initiated failed log_pipelines:1"},
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			agents, conns := newTestAgents(t, map[string]string{"agent": "receivers: {}\n"})
			provider := &flakyProvider{fixedConfigProvider: fixedConfigProvider{config: "receivers: {otlp: {}}\n"}, initiatedFailures: tc.initiatedFailures}

			require.Error(t, agents.RecommendLatestConfigToAll(provider))
			provider.config, provider.id = "receivers: {otlp: {}, zipkin: {}}\n", "log_pipelines:2"
			err := agents.RecommendLatestConfigToAll(provider)
			if tc.wantPushes == 1 {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			assert.Equal(t, tc.wantPushes, conns["agent"].count())
			assert.Equal(t, tc.wantEvents, provider.events)
		})
	}
}
