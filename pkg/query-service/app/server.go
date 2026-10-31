package app

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/archive/implarchive"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/implretention"
	"github.com/fuseone-io/fusescope/pkg/queryparser"

	"github.com/fuseone-io/fusescope/pkg/http/middleware"
	"github.com/fuseone-io/fusescope/pkg/query-service/agentConf"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/clickhouseReader"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/logparsingpipeline"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp"
	opAmpModel "github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/model"
	"github.com/fuseone-io/fusescope/pkg/signoz"

	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/query-service/constants"
)

// Server runs auxiliary servers (opamp) alongside the signoz apiserver
type Server struct {
	opampServer *opamp.Server
}

// NewServer creates and initializes Server
func NewServer(config signoz.Config, signoz *signoz.FuseScope) (*Server, error) {
	integrationsController, err := integrations.NewController(signoz.SQLStore, signoz.Modules.Dashboard, signoz.Instrumentation.Logger())
	if err != nil {
		return nil, err
	}

	reader := clickhouseReader.NewReader(
		signoz.Instrumentation.Logger(),
		signoz.SQLStore,
		signoz.TelemetryStore,
		signoz.Prometheus,
		signoz.TelemetryStore.Cluster(),
		signoz.Cache,
		signoz.Flagger,
		nil,
	)

	retentionDefaults := implretention.NewDefaultsService(signoz.Instrumentation.ToProviderSettings(), reader, signoz.Modules.OrgGetter, config.Retention)
	if err := signoz.Registry.Add(context.Background(), factory.NewNamedService(factory.MustNewName("retentiondefaults"), retentionDefaults)); err != nil {
		return nil, err
	}

	archiveBackstop := implarchive.NewBackstopService(signoz.Instrumentation.ToProviderSettings(), reader, implarchive.NewStore(signoz.SQLStore), config.Archive)
	if err := signoz.Registry.Add(context.Background(), factory.NewNamedService(factory.MustNewName("archivebackstop"), archiveBackstop)); err != nil {
		return nil, err
	}

	archiveRestore := implarchive.NewRestoreService(signoz.Instrumentation.ToProviderSettings(), signoz.TelemetryStore, implarchive.NewStore(signoz.SQLStore), config.Archive)
	if err := signoz.Registry.Add(context.Background(), factory.NewNamedService(factory.MustNewName("archiverestore"), archiveRestore)); err != nil {
		return nil, err
	}

	logParsingPipelineController, err := logparsingpipeline.NewLogParsingPipelinesController(
		signoz.SQLStore,
		integrationsController.GetPipelinesForInstalledIntegrations,
		reader,
		signoz.Flagger,
	)
	if err != nil {
		return nil, err
	}

	apiHandler, err := NewAPIHandler(APIHandlerOpts{
		Reader:                        reader,
		IntegrationsController:        integrationsController,
		LogsParsingPipelineController: logParsingPipelineController,
		FluxInterval:                  config.Querier.FluxInterval,
		Signoz:                        signoz,
		QueryParserAPI:                queryparser.NewAPI(signoz.Instrumentation.ToProviderSettings(), signoz.QueryParser),
	}, config)
	if err != nil {
		return nil, err
	}

	// Register the legacy query-service routes on the apiserver router. The
	// apiserver owns the HTTP server and applies the middleware chain at serve
	// time, so these routes get the same treatment as the apiserver routes.
	r := signoz.APIServer.Router()
	am := middleware.NewAuthZ(signoz.Instrumentation.Logger(), signoz.Modules.OrgGetter, signoz.Authz)

	apiHandler.RegisterRoutes(r, am)
	apiHandler.RegisterLogsRoutes(r, am)
	apiHandler.RegisterIntegrationRoutes(r, am)
	apiHandler.RegisterQueryRangeV3Routes(r, am)
	apiHandler.RegisterQueryRangeV4Routes(r, am)
	apiHandler.RegisterMessagingQueuesRoutes(r, am)
	apiHandler.RegisterThirdPartyApiRoutes(r, am)
	apiHandler.RegisterTraceFunnelsRoutes(r, am)

	opAmpModel.Init(signoz.SQLStore, signoz.Instrumentation.Logger(), signoz.Modules.OrgGetter)

	agentConfMgr, err := agentConf.Initiate(
		&agentConf.ManagerOptions{
			Store: signoz.SQLStore,
			AgentFeatures: []agentConf.AgentFeature{
				logParsingPipelineController,
				signoz.Modules.SpanMapper,
				signoz.Modules.LLMPricingRule,
			},
		},
	)
	if err != nil {
		return nil, err
	}

	s := &Server{}

	s.opampServer = opamp.InitializeServer(
		&opAmpModel.AllAgents,
		agentConfMgr,
		signoz.Instrumentation,
	)

	return s, nil
}

// Start starts the opamp websocket server. The HTTP API server is started by
// the signoz registry.
func (s *Server) Start(ctx context.Context) error {
	slog.Info("Starting OpAmp Websocket server", "addr", constants.OpAmpWsEndpoint)
	if err := s.opampServer.Start(constants.OpAmpWsEndpoint); err != nil {
		return err
	}

	return nil
}

func (s *Server) Stop(ctx context.Context) error {
	s.opampServer.Stop()

	return nil
}
