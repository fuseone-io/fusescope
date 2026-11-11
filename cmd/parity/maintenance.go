package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
)

// waitUntilStopped keeps the investigation's pod alive until it is stopped: the pod runs nothing
// on its own, and an operator execs the investigation into it.
func waitUntilStopped(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func wait(stderr io.Writer) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	fmt.Fprintln(stderr, "parity: waiting for an investigation")
	return waitUntilStopped(ctx)
}

func cleanup(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("cleanup", flag.ContinueOnError)
	flags.SetOutput(stderr)
	settingsFile := flags.String("settings", "", "the parity's settings file")
	if err := flags.Parse(args); err != nil {
		return err
	}
	f, err := os.Open(*settingsFile)
	if err != nil {
		return errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the settings file does not open")
	}
	defer f.Close()
	settings, err := parityrun.ParseSettings(f)
	if err != nil {
		return err
	}
	apiServer := "https://" + net.JoinHostPort(os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT"))
	cleaner, err := parityrun.NewSecretCleaner(parityrun.SecretKeyStoreConfig{APIServer: apiServer, Namespace: settings.Secret.Namespace, TokenFile: settings.Secret.TokenFile, CAFile: settings.Secret.CAFile, Expiry: settings.Secret.Expiry})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	report, err := cleaner.Clean(ctx)
	if reportErr := reportCleanup(report, stdout); err == nil {
		err = reportErr
	}
	return err
}

// reportCleanup prints what a cleanup did, one key a line. A key kept for having no readable
// expiry, or replaced since it was listed, fails the job, so it alerts rather than scrolls by.
func reportCleanup(r parityrun.CleanupReport, out io.Writer) error {
	for _, name := range r.Deleted {
		fmt.Fprintln(out, "deleted", name)
	}
	for _, name := range r.Kept {
		fmt.Fprintln(out, "kept", name, "(no readable expiry)")
	}
	for _, name := range r.Conflicts {
		fmt.Fprintln(out, "changed", name, "(replaced since it was listed)")
	}
	if len(r.Kept) > 0 || len(r.Conflicts) > 0 {
		return errors.Newf(errors.TypeInternal, parityrun.ErrCodeCleanup, "%d run keys need an operator", len(r.Kept)+len(r.Conflicts))
	}
	return nil
}
