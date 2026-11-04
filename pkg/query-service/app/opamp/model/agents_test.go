package model

import (
	"context"
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
}

func (c *recordingConn) Connection() net.Conn { return nil }
func (c *recordingConn) Disconnect() error    { return nil }
func (c *recordingConn) Send(_ context.Context, msg *protobufs.ServerToAgent) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sent = append(c.sent, msg)
	return nil
}

func (c *recordingConn) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.sent)
}

// fixedConfigProvider recommends the same configuration to every agent.
type fixedConfigProvider struct{ config string }

func (p fixedConfigProvider) RecommendAgentConfig(valuer.UUID, []byte) ([]byte, string, error) {
	return []byte(p.config), "log_pipelines:1", nil
}
func (fixedConfigProvider) ReportConfigDeploymentStatus(valuer.UUID, string, string, error) {}
func (fixedConfigProvider) GetDeployStatusByHash(context.Context, valuer.UUID, string) (opamptypes.DeployStatus, error) {
	return opamptypes.DeployStatusUnknown, nil
}

// #261: the broadcast stopped at the first agent whose configuration was
// unchanged, so the agents after it in map order got no push.
func TestRecommendLatestConfigToAllPushesEveryChangedAgent(t *testing.T) {
	const recommended = "recommended"
	orgID := valuer.GenerateUUID()
	agents := &Agents{agentsById: map[string]*Agent{}, connections: map[types.Connection]map[string]bool{}, logger: slog.Default()}
	conns := map[string]*recordingConn{}
	for i := range 21 {
		id := fmt.Sprintf("agent-%02d", i)
		conn := &recordingConn{}
		agent := New(nil, slog.Default(), orgID, id, conn)
		agent.Config = "current"
		if i == 0 {
			agent.Config = recommended
		}
		agents.agentsById[id] = agent
		conns[id] = conn
	}

	// Map order is random: over several broadcasts the unchanged agent
	// comes before some changed one almost surely.
	const broadcasts = 5
	for range broadcasts {
		require.NoError(t, agents.RecommendLatestConfigToAll(fixedConfigProvider{config: recommended}))
	}

	for id, conn := range conns {
		if id == "agent-00" {
			assert.Zero(t, conn.count(), "an unchanged agent gets no push")
			continue
		}
		assert.Equal(t, broadcasts, conn.count(), "pushes to %s", id)
	}
}
