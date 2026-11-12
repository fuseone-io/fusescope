package main

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/flagger"
	"github.com/fuseone-io/fusescope/pkg/flagger/configflagger"
	"github.com/fuseone-io/fusescope/pkg/instrumentation"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityexec"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
	"github.com/fuseone-io/fusescope/pkg/version"
)

func runRound(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("run", flag.ContinueOnError)
	flags.SetOutput(stderr)
	settingsFile := flags.String("settings", "", "the parity's settings file")
	tenantsFile := flags.String("tenants", "", "the tenants file D1 maintains")
	reports := flags.String("reports", "", "the local directory the report is built in before its upload")
	seed := flags.Uint64("seed", 0, "the round's seed; a random one when 0")
	commit := flags.String("backend-commit", os.Getenv("PARITY_BACKEND_COMMIT"), "the backend commit, for the report")
	digest := flags.String("image-digest", os.Getenv("PARITY_IMAGE_DIGEST"), "the parity image digest, for the report")
	engineVersion := flags.String("engine-version", os.Getenv("PARITY_ENGINE_VERSION"), "the engine version, for the report")
	if err := flags.Parse(args); err != nil {
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
	round, err := assemble(ctx, settings, tenants)
	if err != nil {
		return err
	}
	if round, err = deploy(ctx, round, settings, tenants, *reports); err != nil {
		return err
	}
	round.Seed = parity.Seed(*seed)
	summary, err := round.Run(ctx)
	fmt.Fprintf(stdout, "usable=%t qualifying=%t reasons=%v\n", summary.Usable, summary.Qualifying, summary.Reasons)
	return err
}

// assemble builds both graphs and the round over them. The engine graph routes every tenant of the
// file, and only those.
func assemble(ctx context.Context, settings parityrun.Settings, tenants parityrun.Tenants) (parityrun.Round, error) {
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
	return parityrun.Round{
		Engine: engine, ClickHouse: clickhouse, Refuser: refuser, Keys: clickhouse.Keys, Tenants: tenants,
		Config: settings.Round, Now: time.Now, Logger: ps.Logger,
	}, nil
}

// bucketClient is the staging bucket's client, with the pod's workload identity.
func bucketClient(ctx context.Context, settings parityrun.BucketSettings) (*s3.Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, errors.WrapInternalf(err, parityrun.ErrCodeBucket, "the bucket's credentials do not load")
	}
	return parityrun.NewBucketClient(cfg, settings), nil
}

func bucketConfig(settings parityrun.Settings) parityrun.S3Config {
	return parityrun.S3Config{Bucket: settings.Bucket.Name, KMSKeyID: settings.Bucket.KMSKeyID, MaxQueueBytes: settings.Bucket.MaxQueueBytes, MaxQueueSpecs: settings.Bucket.MaxQueueSpecs}
}

// checkDeployment checks what a round writes to before it writes anything: the bucket and the
// requeue's bounds, and the local directory its report is built in.
//
// # Errors
//
// An incomplete bucket configuration, or a local directory that is not one.
func checkDeployment(settings parityrun.Settings, reports string) error {
	if err := bucketConfig(settings).Validate(); err != nil {
		return err
	}
	if info, err := os.Stat(reports); err != nil || !info.IsDir() {
		return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "the reports directory is not one")
	}
	return nil
}

// withHealth gives the round its dual-write health from Prometheus, over the collector instances
// of the tenants file: a round, or an investigation, without it sees every minute unobserved.
func withHealth(round parityrun.Round, settings parityrun.Settings, tenants parityrun.Tenants) (parityrun.Round, error) {
	var instances []string
	for _, t := range tenants.Tenants {
		instances = append(instances, t.CollectorInstances...)
	}
	health, err := parityrun.NewPrometheusHealth(parityrun.PrometheusHealthConfig{URL: settings.Health.URL, TokenFile: settings.Health.TokenFile, InstanceLabel: settings.Health.InstanceLabel, Exporters: settings.Health.Exporters, Instances: instances}, nil)
	if err != nil {
		return round, err
	}
	round.Health = health
	return round, nil
}

// deploy gives the round its deployable ports: the run key in a Secret, the report and the requeue
// in the bucket, the health from Prometheus and the metrics to the Pushgateway. Everything is
// checked before the first of them is built.
func deploy(ctx context.Context, round parityrun.Round, settings parityrun.Settings, tenants parityrun.Tenants, reports string) (parityrun.Round, error) {
	if err := checkDeployment(settings, reports); err != nil {
		return round, err
	}
	round, err := withHealth(round, settings, tenants)
	if err != nil {
		return round, err
	}
	client, err := bucketClient(ctx, settings.Bucket)
	if err != nil {
		return round, err
	}
	bucket := bucketConfig(settings)
	apiServer := "https://" + net.JoinHostPort(os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT"))
	keys, err := parityrun.NewSecretKeyStore(parityrun.SecretKeyStoreConfig{APIServer: apiServer, Namespace: settings.Secret.Namespace, TokenFile: settings.Secret.TokenFile, CAFile: settings.Secret.CAFile, Expiry: settings.Secret.Expiry})
	if err != nil {
		return round, err
	}
	pusher, err := parityrun.NewPushgateway(settings.Pushgateway.URL, settings.Pushgateway.TokenFile, nil)
	if err != nil {
		return round, err
	}
	round.KeyStore, round.Metrics = keys, pusher
	round.Reports = parityrun.S3Sink{Client: client, Config: bucket, Local: parityrun.FileSink{Dir: reports}}
	round.Requeue = parityrun.S3Requeue{Client: client, Config: bucket}
	return round, nil
}
