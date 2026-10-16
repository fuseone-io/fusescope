package main

import (
	"context"
	"log/slog"

	"github.com/spf13/cobra"

	"github.com/fuseone-io/fusescope/cmd"
	"github.com/fuseone-io/fusescope/pkg/alertmanager"
	"github.com/fuseone-io/fusescope/pkg/analytics"
	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authz"
	"github.com/fuseone-io/fusescope/pkg/authz/openfgaauthz"
	"github.com/fuseone-io/fusescope/pkg/authz/openfgaschema"
	"github.com/fuseone-io/fusescope/pkg/authz/openfgaserver"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/gateway"
	"github.com/fuseone-io/fusescope/pkg/gateway/noopgateway"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/licensing"
	"github.com/fuseone-io/fusescope/pkg/licensing/nooplicensing"
	"github.com/fuseone-io/fusescope/pkg/meterreporter"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/cloudintegration/implcloudintegration"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/dashboard/impldashboard"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/metricreductionrule/implmetricreductionrule"
	"github.com/fuseone-io/fusescope/pkg/modules/organization"
	"github.com/fuseone-io/fusescope/pkg/modules/retention"
	"github.com/fuseone-io/fusescope/pkg/modules/rulestatehistory"
	"github.com/fuseone-io/fusescope/pkg/modules/serviceaccount"
	"github.com/fuseone-io/fusescope/pkg/modules/tag"
	"github.com/fuseone-io/fusescope/pkg/prometheus"
	"github.com/fuseone-io/fusescope/pkg/querier"
	"github.com/fuseone-io/fusescope/pkg/query-service/app"
	"github.com/fuseone-io/fusescope/pkg/queryparser"
	"github.com/fuseone-io/fusescope/pkg/ruler"
	"github.com/fuseone-io/fusescope/pkg/ruler/signozruler"
	"github.com/fuseone-io/fusescope/pkg/signoz"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/fuseone-io/fusescope/pkg/subscription"
	"github.com/fuseone-io/fusescope/pkg/subscription/noopsubscription"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/types/dashboardtypes"
	"github.com/fuseone-io/fusescope/pkg/types/telemetrytypes"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/fuseone-io/fusescope/pkg/zeus"
	"github.com/fuseone-io/fusescope/pkg/zeus/noopzeus"
)

func registerServer(parentCmd *cobra.Command, logger *slog.Logger) {
	var configFiles []string

	serverCmd := &cobra.Command{
		Use:                "server",
		Short:              "Run the SigNoz server",
		FParseErrWhitelist: cobra.FParseErrWhitelist{UnknownFlags: true},
		RunE: func(currCmd *cobra.Command, args []string) error {
			config, err := cmd.NewSigNozConfig(currCmd.Context(), logger, configFiles)
			if err != nil {
				return err
			}

			return runServer(currCmd.Context(), config, logger)
		},
	}

	serverCmd.Flags().StringArrayVar(&configFiles, "config", nil, "path to a YAML configuration file (can be specified multiple times, later files override earlier ones)")
	parentCmd.AddCommand(serverCmd)
}

func runServer(ctx context.Context, config signoz.Config, logger *slog.Logger) error {
	// print the version
	version.Info.PrettyPrint(config.Version)

	signoz, err := signoz.New(
		ctx,
		config,
		zeus.Config{},
		noopzeus.NewProviderFactory(),
		licensing.Config{},
		func(_ sqlstore.SQLStore, _ zeus.Zeus, _ organization.Getter, _ analytics.Analytics) factory.ProviderFactory[licensing.Licensing, licensing.Config] {
			return nooplicensing.NewFactory()
		},
		func(_ zeus.Zeus, _ licensing.Licensing) subscription.Subscription {
			return noopsubscription.New()
		},
		signoz.NewEmailingProviderFactories(),
		signoz.NewCacheProviderFactories(),
		signoz.NewWebProviderFactories(config.Global),
		sqlschemaProviderFactories,
		sqlstoreProviderFactories(),
		signoz.NewTelemetryStoreProviderFactories(),
		func(ctx context.Context, providerSettings factory.ProviderSettings, store authtypes.AuthNStore, licensing licensing.Licensing) (map[authtypes.AuthNProvider]authn.AuthN, error) {
			return signoz.NewAuthNs(ctx, providerSettings, store, licensing, config.Global)
		},
		func(ctx context.Context, sqlstore sqlstore.SQLStore, config authz.Config, _ licensing.Licensing, _ []authz.OnBeforeRoleDelete) (factory.ProviderFactory[authz.AuthZ, authz.Config], error) {
			openfgaDataStore, err := openfgaserver.NewSQLStore(sqlstore, config)
			if err != nil {
				return nil, err
			}

			return openfgaauthz.NewProviderFactory(sqlstore, openfgaschema.NewSchema().Get(ctx), openfgaDataStore, authtypes.NewRegistry()), nil
		},
		func(store sqlstore.SQLStore, settings factory.ProviderSettings, analytics analytics.Analytics, orgGetter organization.Getter, queryParser queryparser.QueryParser, _ querier.Querier, _ licensing.Licensing, tagModule tag.Module, systemDashboardRegistry dashboardtypes.SystemDashboardRegistry) dashboard.Module {
			return impldashboard.NewModule(impldashboard.NewStore(store), settings, analytics, orgGetter, queryParser, tagModule, systemDashboardRegistry)
		},
		func(_ licensing.Licensing) factory.ProviderFactory[gateway.Gateway, gateway.Config] {
			return noopgateway.NewProviderFactory()
		},
		func(_ licensing.Licensing) factory.NamedMap[factory.ProviderFactory[auditor.Auditor, auditor.Config]] {
			return signoz.NewAuditorProviderFactories()
		},
		func(_ context.Context, _ factory.ProviderSettings, _ flagger.Flagger, _ licensing.Licensing, _ telemetrystore.TelemetryStore, _ retention.Getter, _ organization.Getter, _ zeus.Zeus) (factory.NamedMap[factory.ProviderFactory[meterreporter.Reporter, meterreporter.Config]], string) {
			return signoz.NewMeterReporterProviderFactories(), "noop"
		},
		func(ps factory.ProviderSettings, q querier.Querier, a analytics.Analytics) querier.Handler {
			return querier.NewHandler(ps, q, a)
		},
		func(_ sqlstore.SQLStore, _ dashboard.Module, _ global.Global, _ zeus.Zeus, _ gateway.Gateway, _ licensing.Licensing, _ serviceaccount.Module, _ cloudintegration.Config) (cloudintegration.Module, error) {
			return implcloudintegration.NewModule(), nil
		},
		func(_ sqlstore.SQLStore, _ telemetrystore.TelemetryStore, _ dashboard.Module, _ queryparser.QueryParser, _ licensing.Licensing, _ flagger.Flagger, _ telemetrytypes.MetadataStore, _ factory.ProviderSettings, _ int) metricreductionrule.Module {
			return implmetricreductionrule.NewModule()
		},
		func(c cache.Cache, am alertmanager.Alertmanager, ss sqlstore.SQLStore, ts telemetrystore.TelemetryStore, ms telemetrytypes.MetadataStore, p prometheus.Prometheus, og organization.Getter, rsh rulestatehistory.Module, q querier.Querier, qp queryparser.QueryParser) factory.NamedMap[factory.ProviderFactory[ruler.Ruler, ruler.Config]] {
			return factory.MustNewNamedMap(signozruler.NewFactory(c, am, ss, ts, ms, p, og, rsh, q, qp, nil, nil))
		},
	)
	if err != nil {
		logger.ErrorContext(ctx, "failed to create signoz", errors.Attr(err))
		return err
	}

	server, err := app.NewServer(config, signoz)
	if err != nil {
		logger.ErrorContext(ctx, "failed to create server", errors.Attr(err))
		return err
	}

	if err := server.Start(ctx); err != nil {
		logger.ErrorContext(ctx, "failed to start server", errors.Attr(err))
		return err
	}

	signoz.Start(ctx)

	if err := signoz.Wait(ctx); err != nil {
		logger.ErrorContext(ctx, "failed to start signoz", errors.Attr(err))
		return err
	}

	err = server.Stop(ctx)
	if err != nil {
		logger.ErrorContext(ctx, "failed to stop server", errors.Attr(err))
		return err
	}

	err = signoz.Stop(ctx)
	if err != nil {
		logger.ErrorContext(ctx, "failed to stop signoz", errors.Attr(err))
		return err
	}

	return nil
}
