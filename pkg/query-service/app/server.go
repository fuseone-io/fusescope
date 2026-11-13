package app

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/retention/implretention"
	"github.com/fuseone-io/fusescope/pkg/queryparser"

	"github.com/fuseone-io/fusescope/pkg/http/middleware"
	"github.com/fuseone-io/fusescope/pkg/query-service/agentConf"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/clickhouseReader"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/integrations"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/logparsingpipeline"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp"
	"github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/ingest"
	opAmpModel "github.com/fuseone-io/fusescope/pkg/query-service/app/opamp/model"
	"github.com/fuseone-io/fusescope/pkg/signoz"

	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/query-service/constants"
)

// Server runs auxiliary servers (opamp) alongside the signoz apiserver
type Server struct {
	opampServer *opamp.Server
	ingest      *ingest.Service
	reports     *ingest.Reports
	stopIngest  context.CancelFunc
}

// NewServer creates and initializes Server
func NewServer(config signoz.Config, signoz *signoz.FuseScope) (*Server, error) {
	integrationsController, err := integrations.NewController(signoz.SQLStore, signoz.Modules.Dashboard, signoz.Ruler, config.Integrations.AutoInstall, signoz.Instrumentation.Logger())
	if err != nil {
		return nil, err
	}
	autoInstall, err := integrationsController.NewAutoInstallService(signoz.Instrumentation.ToProviderSettings(), signoz.Modules.OrgGetter, config.Integrations)
	if err != nil {
		return nil, err
	}
	if err := signoz.Registry.Add(context.Background(), factory.NewNamedService(factory.MustNewName("integrationsautoinstall"), autoInstall)); err != nil {
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

	logger := signoz.Instrumentation.Logger()
	if policy := config.RUM.IngestPolicy; policy.TokenFile != "" {
		tokens, err := ingest.LoadTokens(policy.TokenFile)
		if err != nil {
			return nil, err
		}
		tlsConfig, err := ingest.ServerTLS(policy.TLS.CertFile, policy.TLS.KeyFile, policy.TLS.ClientCAFile)
		if err != nil {
			return nil, err
		}
		publisher := ingest.NewPublisher(signoz.SQLStore, signoz.Modules.RUMApplication, logger)
		hub := ingest.NewHub(publisher, logger)
		s.ingest = ingest.NewService(publisher, hub, logger)
		s.reports = ingest.NewReports(ingest.NewReportStore(signoz.SQLStore, signoz.Modules.RUMApplication), hub, publisher, logger)
		signoz.Modules.RUMApplication.OnChange(s.ingest.Changed)
		s.opampServer.WithIngest(hub, s.reports, tokens, policy.Listen, tlsConfig)
	} else {
		logger.Info("ingest policy not published: rum.ingest_policy.token_file is not set")
	}

	return s, nil
}

// Start starts the opamp websocket server. The HTTP API server is started by
// the signoz registry.
func (s *Server) Start(ctx context.Context) error {
	slog.Info("Starting OpAmp Websocket server", "addr", constants.OpAmpWsEndpoint)
	if err := s.opampServer.Start(constants.OpAmpWsEndpoint); err != nil {
		return err
	}

	if s.ingest != nil {
		ingestCtx, stop := context.WithCancel(context.Background())
		s.stopIngest = stop
		go s.ingest.Run(ingestCtx)
		go s.reports.Run(ingestCtx)
	}

	return nil
}

func (s *Server) Stop(ctx context.Context) error {
	if s.stopIngest != nil {
		s.stopIngest()
	}
	s.opampServer.Stop()

	return nil
}
