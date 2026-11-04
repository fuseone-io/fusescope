package opamp

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/open-telemetry/opamp-go/protobufs"
	"github.com/open-telemetry/opamp-go/server"
	"github.com/open-telemetry/opamp-go/server/types"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/instrumentation"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/ingest"
	model "github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/model"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var opAmpServer *Server

type Server struct {
	server server.OpAMPServer
	agents *model.Agents
	logger *slog.Logger

	agentConfigProvider AgentConfigProvider
	ingest              *ingest.Hub
	ingestReports       *ingest.Reports
	ingestTokens        *ingest.Tokens
	// ingestServer is the OpAMP listener with TLS on ingestListen, the only
	// one where ingest tokens are read.
	ingestServer server.OpAMPServer
	ingestListen string
	ingestTLS    *tls.Config
	ingestLimits ingestLimits
	ingestHTTP   *ingestListener

	plaintextTokenLog, refusedTokenLog atomic.Int64

	// cleanups to be run when stopping the server
	cleanups []func()
}

const capabilities = protobufs.ServerCapabilities_ServerCapabilities_AcceptsEffectiveConfig |
	protobufs.ServerCapabilities_ServerCapabilities_OffersRemoteConfig |
	protobufs.ServerCapabilities_ServerCapabilities_AcceptsStatus

func InitializeServer(
	agents *model.Agents,
	agentConfigProvider AgentConfigProvider,
	instrumentation instrumentation.Instrumentation,
) *Server {
	if agents == nil {
		agents = &model.AllAgents
	}

	opAmpServer = &Server{
		agents:              agents,
		agentConfigProvider: agentConfigProvider,
		logger:              instrumentation.Logger(),
	}
	opAmpServer.server = server.New(wrappedLogger(instrumentation.Logger()))
	return opAmpServer
}

// WithIngest sends the ingest policy to the ingress collectors that
// authenticate with one of tokens, and takes their ingest reports (ADR 0010
// §3, §6), on a second OpAMP listener at listen with tlsConfig. Without it,
// no connection receives the policy or is read a report.
func (srv *Server) WithIngest(hub *ingest.Hub, reports *ingest.Reports, tokens *ingest.Tokens, listen string, tlsConfig *tls.Config) {
	srv.ingest, srv.ingestReports, srv.ingestTokens = hub, reports, tokens
	srv.ingestListen, srv.ingestTLS, srv.ingestLimits = listen, tlsConfig, defaultIngestLimits
	srv.ingestServer = server.New(wrappedLogger(srv.logger))
}

// settings are the callbacks of a listener. The plaintext listener accepts
// every connection, for remote configuration, and never reads a token. The
// ingest listener accepts only a connection that presents one of the
// tokens, refused at the handshake otherwise; it may receive the ingest
// policy.
func (srv *Server) settings(ingestListener bool) server.Settings {
	return server.Settings{
		// The largest ingest policy fits; nothing larger is read from an
		// unauthenticated connection.
		MaxMessageSize: ingest.MaxMessageSize,
		Callbacks: types.Callbacks{
			OnConnecting: func(request *http.Request) types.ConnectionResponse {
				authenticated := false
				if ingestListener {
					if authenticated = srv.authenticateIngest(request); !authenticated {
						return types.ConnectionResponse{Accept: false, HTTPStatusCode: http.StatusUnauthorized}
					}
				} else if request.Header.Get("Authorization") != "" && srv.ingest != nil {
					srv.warnEveryMinute(&srv.plaintextTokenLog, "OpAMP connection presented an ingest token without TLS; it is not read and gets no ingest policy: connect to the TLS listener and replace the token", "remote_addr", request.RemoteAddr, "ingest_listen", srv.ingestListen)
				}
				return types.ConnectionResponse{
					Accept: true,
					ConnectionCallbacks: types.ConnectionCallbacks{
						OnMessage: func(ctx context.Context, conn types.Connection, msg *protobufs.AgentToServer) *protobufs.ServerToAgent {
							return srv.onMessage(ctx, conn, msg, authenticated)
						},
						OnConnectionClose: srv.onDisconnect,
					},
				}
			},
		},
	}
}

// Start serves OpAMP on listener, without TLS, and the ingest listener with
// TLS when WithIngest set it. If either cannot start, nothing stays started.
func (srv *Server) Start(listener string) error {
	// This will have to send request to all the agents of all tenants
	unsubscribe := srv.agentConfigProvider.SubscribeToConfigUpdates(func() {
		err := srv.agents.RecommendLatestConfigToAll(srv.agentConfigProvider)
		if err != nil {
			srv.logger.Error(
				"could not roll out latest config recommendation to connected agents", errors.Attr(err),
			)
		}
	})
	srv.cleanups = append(srv.cleanups, unsubscribe)

	if srv.ingestServer != nil {
		handler, connContext, err := srv.ingestServer.Attach(srv.settings(true))
		if err == nil {
			srv.ingestHTTP, err = startIngestListener(srv.ingestListen, srv.ingestTLS, handler, connContext, srv.ingestLimits)
		}
		if err != nil {
			srv.undo()
			return err
		}
		srv.logger.Info("ingress collectors' OpAMP listener with TLS started", slog.String("addr", srv.ingestHTTP.Addr().String()))
	}

	// opamp-go's Stop after a failed Start waits for a server that never
	// served, so only what started is undone.
	if err := srv.server.Start(server.StartSettings{Settings: srv.settings(false), ListenEndpoint: listener}); err != nil {
		srv.undo()
		return err
	}
	return nil
}

func (srv *Server) Stop() {
	defer srv.undo()
	_ = srv.server.Stop(context.Background())
}

// undo stops the ingest listener and runs the cleanups.
func (srv *Server) undo() {
	if srv.ingestHTTP != nil {
		_ = srv.ingestHTTP.Stop(context.Background())
		srv.ingestHTTP = nil
	}
	cleanups := srv.cleanups
	srv.cleanups = nil
	for _, cleanup := range cleanups {
		cleanup()
	}
}

// authenticateIngest reports whether the connection presented one of the
// ingest tokens over TLS. A token sent without TLS is never accepted: it
// may have been read on the way.
func (srv *Server) authenticateIngest(request *http.Request) bool {
	if srv.ingest == nil || request.TLS == nil {
		return false
	}
	authorization := request.Header.Get("Authorization")
	if authorization != "" && srv.ingestTokens.Verify(authorization) {
		return true
	}
	srv.warnEveryMinute(&srv.refusedTokenLog, "ingest OpAMP connection refused: no known ingest token", "remote_addr", request.RemoteAddr)
	return false
}

// warnEveryMinute logs at most once a minute per last, so a client cannot
// grow the log by connecting again and again.
func (srv *Server) warnEveryMinute(last *atomic.Int64, msg string, args ...any) {
	now := time.Now().UnixNano()
	prev := last.Load()
	if now-prev < int64(time.Minute) || !last.CompareAndSwap(prev, now) {
		return
	}
	srv.logger.Warn(msg, args...)
}

func (srv *Server) onDisconnect(conn types.Connection) {
	srv.agents.RemoveConnection(conn)
	if srv.ingest != nil {
		srv.ingest.Remove(conn)
	}
}

// When the agent sends the message for the first time, then we need to know the orgID
// For the subsequent requests, agents don't send the attributes unless something is changed
// but we keep them in context mapped which is mapped to the instanceID, so we would know the
// orgID from the context
// note :- there can only be 50 agents in the db for a given orgID, we don't have a check in-memory but we delete from the db after insert.
func (srv *Server) OnMessage(ctx context.Context, conn types.Connection, msg *protobufs.AgentToServer) *protobufs.ServerToAgent {
	return srv.onMessage(ctx, conn, msg, false)
}

func (srv *Server) onMessage(ctx context.Context, conn types.Connection, msg *protobufs.AgentToServer, ingestAuthenticated bool) *protobufs.ServerToAgent {
	agentID, uidErr := valuer.NewUUIDFromBytes(msg.GetInstanceUid())

	// find the orgID, if nothing is found keep it empty.
	// the find or create agent will return an error if orgID is empty
	// thus retry will happen
	var orgID valuer.UUID
	orgIDs, err := srv.agents.OrgGetter.ListByOwnedKeyRange(context.Background())
	if err == nil && len(orgIDs) == 1 {
		orgID = orgIDs[0].ID
	}

	// when a new org is created and the agent is not able to register
	// the changes in pkg/query-service/app/opamp/model/agent.go 270 - 277 takes care that
	// agents sends the effective config when we processStatusUpdate.
	agent, created, err := srv.agents.FindOrCreateAgent(agentID.String(), conn, orgID)
	if err != nil {
		srv.logger.Error("failed to find or create agent", "agent_id", agentID.String(), errors.Attr(err))

		// Return error response according to OpAMP protocol
		return &protobufs.ServerToAgent{
			InstanceUid: msg.GetInstanceUid(),
			ErrorResponse: &protobufs.ServerErrorResponse{
				Type: protobufs.ServerErrorResponseType_ServerErrorResponseType_Unavailable,
				Details: &protobufs.ServerErrorResponse_RetryInfo{
					RetryInfo: &protobufs.RetryInfo{
						RetryAfterNanoseconds: uint64(5 * time.Second), // minimum recommended retry interval
					},
				},
			},
			// Note: refer to opamp/model/agent.go; look for `Flags` keyword
			// Flags: uint64(protobufs.ServerToAgentFlags_ServerToAgentFlags_ReportFullState),
		}
	}

	if created {
		agent.CanLB = model.ExtractLbFlag(msg.AgentDescription)
		srv.logger.Debug(
			"new agent added", "can_lb", agent.CanLB,
			"agent_id", agent.AgentID,
			"status", agent.Status,
		)
	}

	if srv.ingest != nil && ingestAuthenticated {
		srv.ingest.Observe(agent.AgentID, conn, msg)
	}

	response := &protobufs.ServerToAgent{
		InstanceUid:  msg.GetInstanceUid(),
		Capabilities: uint64(capabilities),
	}

	agent.UpdateStatus(msg, response, srv.agentConfigProvider)

	if page, ok := reportPage(msg, ingestAuthenticated && srv.ingestReports != nil, uidErr == nil && !agentID.IsZero()); ok {
		if ack := srv.ingestReports.Receive(agent.AgentID, conn, page); ack != nil && response.CustomMessage == nil {
			response.CustomMessage = ack
		}
	}

	return response
}

// reportPage is the ingest report page msg carries, read only from an
// authenticated connection and, since a report is kept per agent, from an
// agent with a UID of its own.
func reportPage(msg *protobufs.AgentToServer, authenticated, ownUID bool) ([]byte, bool) {
	custom := msg.GetCustomMessage()
	if !authenticated || !ownUID || custom.GetCapability() != ingestpolicy.Capability || custom.GetType() != ingestpolicy.TypeReport {
		return nil, false
	}
	return custom.GetData(), true
}

// global var methods to support singleton pattern. we want to discourage
// allow multiple servers in one installation
func Ready() bool {
	if opAmpServer == nil {
		return false
	}
	if opAmpServer.agents.Count() == 0 {
		slog.Warn("no agents available, all agent config requests will be rejected")
		return false
	}
	return true
}

func Subscribe(orgId valuer.UUID, agentId string, hash string, f model.OnChangeCallback) {
	model.ListenToConfigUpdate(orgId, agentId, hash, f)
}
