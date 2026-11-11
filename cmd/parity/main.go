// Command parity runs a D5 parity round: the trace views on ClickHouse and on fusescope-engine,
// compared, classified and reported by fingerprint.
package main

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/flagger/configflagger"
	"github.com/fuseone-io/fusescope/pkg/instrumentation"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
	"github.com/fuseone-io/fusescope/pkg/version"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "parity:", errorCode(err))
		os.Exit(1)
	}
}

// errorCode is how a failure is printed: by type and code, never its message.
func errorCode(err error) string {
	if e := parityrun.ErrorOf("parity", err); e != nil {
		return e.Type + "/" + e.Code
	}
	return ""
}

func run(args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 || args[0] != "run" {
		fmt.Fprintln(stderr, "usage: parity run -settings FILE -tenants FILE -reports DIR [-seed N]")
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "unknown command")
	}
	flags := flag.NewFlagSet("run", flag.ContinueOnError)
	flags.SetOutput(stderr)
	settingsFile := flags.String("settings", "", "the parity's settings file")
	tenantsFile := flags.String("tenants", "", "the tenants file D1 maintains")
	reports := flags.String("reports", "", "the directory the round's report is published to")
	seed := flags.Uint64("seed", 0, "the round's seed; a random one when 0")
	commit := flags.String("backend-commit", os.Getenv("PARITY_BACKEND_COMMIT"), "the backend commit, for the report")
	digest := flags.String("image-digest", os.Getenv("PARITY_IMAGE_DIGEST"), "the parity image digest, for the report")
	engineVersion := flags.String("engine-version", os.Getenv("PARITY_ENGINE_VERSION"), "the engine version, for the report")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	settings, tenants, err := load(*settingsFile, *tenantsFile)
	if err != nil {
		return err
	}
	settings.Round.Build = parityrun.BuildInfo{BackendCommit: *commit, ImageDigest: *digest, EngineVersion: *engineVersion}
	if *seed == 0 {
		var b [8]byte
		if _, err := rand.Read(b[:]); err != nil {
			return errors.WrapInternalf(err, errors.CodeInternal, "error drawing a seed")
		}
		*seed = binary.BigEndian.Uint64(b[:])
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	round, err := assemble(ctx, settings, tenants, *reports, parity.Seed(*seed))
	if err != nil {
		return err
	}
	fmt.Fprintln(stderr, "parity: the run key and the requeue are kept in memory and no dual-write health source is set (D5 PR 4b): this round does not qualify")
	summary, err := round.Run(ctx)
	fmt.Fprintf(stdout, "qualifying=%t reasons=%v\n", summary.Qualifying, summary.Reasons)
	return err
}

func load(settingsFile, tenantsFile string) (parityrun.Settings, parityrun.Tenants, error) {
	sf, err := os.Open(settingsFile)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the settings file does not open")
	}
	defer sf.Close()
	settings, err := parityrun.ParseSettings(sf)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, err
	}
	tf, err := os.Open(tenantsFile)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the tenants file does not open")
	}
	defer tf.Close()
	tenants, err := parityrun.ParseTenants(tf)
	return settings, tenants, err
}

// assemble builds both graphs, their dependencies and the round. The engine graph routes every
// tenant of the file, and only those.
func assemble(ctx context.Context, settings parityrun.Settings, tenants parityrun.Tenants, reports string, seed parity.Seed) (parityrun.Round, error) {
	sdk, err := instrumentation.New(ctx, instrumentation.Config{Logs: instrumentation.LogsConfig{Level: slog.LevelInfo}}, version.Info, "fusescope-parity")
	if err != nil {
		return parityrun.Round{}, err
	}
	ps := sdk.ToProviderSettings()
	registry := flagger.MustNewRegistry()
	fl, err := flagger.New(ctx, ps, flagger.Config{}, registry, configflagger.NewFactory(registry))
	if err != nil {
		return parityrun.Round{}, err
	}
	cfg := parityexec.Config{Querier: settings.Querier, TraceDetail: settings.TraceDetail}
	for _, t := range tenants.Tenants {
		cfg.Orgs = append(cfg.Orgs, t.Org)
	}
	engine, refuser, err := parityexec.NewEngineGraph(ctx, ps, fl, settings.Engine, cfg)
	if err != nil {
		return parityrun.Round{}, err
	}
	clickhouse, err := parityexec.NewClickHouseGraph(ctx, ps, fl, settings.ClickHouse, cfg)
	if err != nil {
		return parityrun.Round{}, err
	}
	pusher, err := parityrun.NewPushgateway(settings.Pushgateway.URL, settings.Pushgateway.TokenFile, nil)
	if err != nil {
		return parityrun.Round{}, err
	}
	return parityrun.Round{
		Engine: engine, ClickHouse: clickhouse, Refuser: refuser, Keys: clickhouse.Keys, Tenants: tenants,
		KeyStore: parityrun.NewMemoryKeyStore(), Reports: parityrun.FileSink{Dir: reports}, Metrics: pusher, Requeue: parityrun.NewMemoryRequeue(),
		Config: settings.Round, Seed: seed, Now: time.Now,
	}, nil
}
