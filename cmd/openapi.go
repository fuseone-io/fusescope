package cmd

import (
	"context"
	"log/slog"

	"github.com/fuseone-io/fusescope/pkg/instrumentation"
	"github.com/fuseone-io/fusescope/pkg/signoz"
	"github.com/fuseone-io/fusescope/pkg/version"
	"github.com/spf13/cobra"
)

func registerGenerateOpenAPI(parentCmd *cobra.Command) {
	openapiCmd := &cobra.Command{
		Use:   "openapi",
		Short: "Generate OpenAPI schema for FuseScope",
		RunE: func(currCmd *cobra.Command, args []string) error {
			return runGenerateOpenAPI(currCmd.Context())
		},
	}

	parentCmd.AddCommand(openapiCmd)
}

func runGenerateOpenAPI(ctx context.Context) error {
	instrumentation, err := instrumentation.New(ctx, instrumentation.Config{Logs: instrumentation.LogsConfig{Level: slog.LevelInfo}}, version.Info, "signoz")
	if err != nil {
		return err
	}

	openapi, err := signoz.NewOpenAPI(ctx, instrumentation)
	if err != nil {
		return err
	}

	if err := openapi.CreateAndWrite("docs/api/openapi.yml"); err != nil {
		return err
	}

	return nil
}
