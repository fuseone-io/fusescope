package model

import (
	"context"
	stderrors "errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/types/opamptypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server/types"
	"github.com/pkg/errors"
)

var AllAgents = Agents{
	agentsById:  map[string]*Agent{},
	connections: map[types.Connection]map[string]bool{},
}

type Agents struct {
	mux         sync.RWMutex
	agentsById  map[string]*Agent
	connections map[types.Connection]map[string]bool
	store       sqlstore.SQLStore
	OrgGetter   organization.Getter
	logger      *slog.Logger
}

func (a *Agents) Count() int {
	return len(a.connections)
}

// Initialize the database and create schema if needed
func Init(sqlStore sqlstore.SQLStore, logger *slog.Logger, orgGetter organization.Getter) {

	AllAgents = Agents{
		agentsById:  make(map[string]*Agent),
		connections: make(map[types.Connection]map[string]bool),
		mux:         sync.RWMutex{},
		store:       sqlStore,
		OrgGetter:   orgGetter,
		logger:      logger,
	}
}

// RemoveConnection removes the connection all Agent instances associated with the
// connection.
func (agents *Agents) RemoveConnection(conn types.Connection) {
	agents.mux.Lock()
	defer agents.mux.Unlock()

	for instanceId := range agents.connections[conn] {
		agent := agents.agentsById[instanceId]
		agent.StorableAgent.Status = opamptypes.AgentStatusDisconnected
		agent.StorableAgent.TerminatedAt = time.Now()
		_ = agent.Upsert()
		delete(agents.agentsById, instanceId)
	}
	delete(agents.connections, conn)
}

// FindAgent returns the Agent instance associated with the given agentID.
func (agents *Agents) FindAgent(agentID string) *Agent {
	agents.mux.RLock()
	defer agents.mux.RUnlock()
	return agents.agentsById[agentID]
}

// FindOrCreateAgent returns the Agent instance associated with the given agentID.
// If the Agent instance does not exist, it is created and added to the list of
// Agent instances.
func (agents *Agents) FindOrCreateAgent(agentID string, conn types.Connection, orgID valuer.UUID) (*Agent, bool, error) {
	if agentID == "" {
		return nil, false, errors.New("cannot create agent without agentID")
	}

	agents.mux.Lock()
	defer agents.mux.Unlock()
	agent, ok := agents.agentsById[agentID]

	if ok && agent != nil {
		return agent, false, nil
	}

	if !ok && orgID.IsZero() {
		return nil, false, errors.New("cannot create agent without orgId")
	}

	agent = New(agents.store, agents.logger, orgID, agentID, conn)
	err := agent.Upsert()
	if err != nil {
		return nil, false, err
	}
	agent.KeepOnlyLast50Agents(context.Background())
	agents.agentsById[agentID] = agent

	if agents.connections[conn] == nil {
		agents.connections[conn] = map[string]bool{}
	}
	agents.connections[conn][agentID] = true
	return agent, true, nil
}

func (agents *Agents) GetAllAgents() []*Agent {
	agents.mux.RLock()
	defer agents.mux.RUnlock()

	allAgents := []*Agent{}
	for _, v := range agents.agentsById {
		allAgents = append(allAgents, v)
	}
	return allAgents
}

// broadcastConcurrency bounds the agents pushed to at once, so slow agents
// cost about one send timeout each batch, not one each.
const broadcastConcurrency = 16

// Recommend latest config to connected agents whose effective
// config is not the same as the latest recommendation. An agent that fails
// does not stop the push to the others; their errors are returned joined.
func (agents *Agents) RecommendLatestConfigToAll(
	provider AgentConfigProvider,
) error {
	var (
		mu   sync.Mutex
		errs []error
		wg   sync.WaitGroup
	)
	slots := make(chan struct{}, broadcastConcurrency)
	for _, agent := range agents.GetAllAgents() {
		slots <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			if err := agents.recommendLatestConfig(agent, provider); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return stderrors.Join(errs...)
}

func (agents *Agents) recommendLatestConfig(agent *Agent, provider AgentConfigProvider) error {
	agent.mux.Lock()
	defer agent.mux.Unlock()

	recommendation, err := provider.RecommendAgentConfig(agent.OrgID, []byte(agent.Config))
	if err != nil {
		return errors.Wrap(err, fmt.Sprintf("could not generate conf recommendation for %v", agent.AgentID))
	}

	if sameConfig(recommendation.Config, []byte(agent.Config)) {
		agents.logger.Info(
			"recommended config same as current effective config for agent", "agent_id", agent.AgentID,
		)
		return nil
	}

	agent.remoteConfig = newRemoteConfig(recommendation)
	agent.recommendation = recommendation
	if err := agent.pushRemoteConfig(&protobufs.ServerToAgent{RemoteConfig: agent.remoteConfig}, provider); err != nil {
		return errors.Wrap(err, fmt.Sprintf("could not push config to %v", agent.AgentID))
	}
	return nil
}
