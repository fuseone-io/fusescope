package model

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"testing"

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

	mu        sync.Mutex
	initiated []string
}

func (p *fixedConfigProvider) RecommendAgentConfig(valuer.UUID, []byte) (*opamptypes.ConfigRecommendation, error) {
	return &opamptypes.ConfigRecommendation{Config: []byte(p.config), ID: "log_pipelines:1"}, nil
}
func (p *fixedConfigProvider) ReportConfigDeploymentInitiated(_ valuer.UUID, recommendation *opamptypes.ConfigRecommendation) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.initiated = append(p.initiated, recommendation.ID)
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
