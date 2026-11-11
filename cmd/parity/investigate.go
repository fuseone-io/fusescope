package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/parity/parityinvestigate"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
)

const (
	// maxTokenBytes and maxKeyBytes cap what the operator's descriptors may hold.
	maxTokenBytes = 16 << 10
	maxKeyBytes   = 128
	// closeTimeout bounds the closing audit event, sent once the session ends.
	closeTimeout = 30 * time.Second
)

// secretSource opens the descriptor a secret comes through: the pod's terminal, or a numbered
// descriptor other than stdin, stdout and stderr.
func secretSource(name string) (*os.File, error) {
	if name == "tty" {
		f, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
		if err != nil {
			return nil, errors.Newf(errors.TypeInvalidInput, parityinvestigate.ErrCodeSecret, "no terminal to read a secret from")
		}
		return f, nil
	}
	fd, err := strconv.Atoi(name)
	if err != nil || fd <= 2 {
		return nil, errors.Newf(errors.TypeInvalidInput, parityinvestigate.ErrCodeSecret, "a secret comes from tty or a descriptor above 2, never stdin")
	}
	return os.NewFile(uintptr(fd), "secret"), nil
}

func readSecret(name, prompt string, limit int, stderr io.Writer) ([]byte, error) {
	f, err := secretSource(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if name == "tty" {
		fmt.Fprint(stderr, prompt)
		defer fmt.Fprintln(stderr)
	}
	return parityinvestigate.ReadSecret(f, limit)
}

func investigate(args []string, stdout, stderr io.Writer) error {
	if err := parityinvestigate.CheckThisEnvironment(); err != nil {
		return err
	}
	flags := flag.NewFlagSet("investigate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	settingsFile := flags.String("settings", "", "the parity's settings file")
	tenantsFile := flags.String("tenants", "", "the tenants file")
	runID := flags.String("run", "", "the round to investigate")
	org := flags.String("tenant", "", "the one tenant to look at")
	class := flags.String("class", "", "settled or recent")
	identityFD := flags.String("identity-fd", "", "where the operator's ID token comes from: tty or a descriptor")
	keyFD := flags.String("key-fd", "", "where the round's key, base64 as its Secret holds it, comes from: tty or a descriptor")
	if err := flags.Parse(args); err != nil {
		return err
	}
	settings, tenants, err := load(*settingsFile, *tenantsFile)
	if err != nil {
		return err
	}
	tenant, ok := tenantOf(tenants, *org)
	windowClass := parity.WindowClass(*class)
	if !ok || (windowClass != parity.Settled && windowClass != parity.Recent) {
		return errors.Newf(errors.TypeInvalidInput, parityrun.ErrCodeInvestigation, "a tenant of the file and a window class are needed")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	operator, err := identify(ctx, settings.Investigate, *identityFD, stderr)
	if err != nil {
		return err
	}
	key, err := readKey(*keyFD, stderr)
	if err != nil {
		return err
	}
	defer parityinvestigate.Wipe(key)
	audit, err := parityinvestigate.NewAuditSink(settings.Investigate.AuditEndpoint, settings.Investigate.AuditTokenFile, nil)
	if err != nil {
		return err
	}
	client, err := bucketClient(ctx)
	if err != nil {
		return err
	}
	header, records, err := parityrun.ReadReport(ctx, client, settings.Bucket.Name, *runID)
	if err != nil {
		return err
	}
	if header.RunID != *runID {
		return errors.Newf(errors.TypeForbidden, parityrun.ErrCodeInvestigation, "the report is not this round's")
	}
	w, err := parityrun.InvestigatedWindow(key, header, tenant, windowClass)
	if err != nil {
		return err
	}
	session, err := newSession(rand.Reader, operator, *runID, tenant.Org.StringValue(), windowClass, w)
	if err != nil {
		return err
	}
	if err := audit.Emit(ctx, session, parityinvestigate.PhaseStarted, 0); err != nil {
		return err
	}
	inv := parityrun.Investigation{Header: header, Records: records, Tenant: tenant, Class: windowClass}
	shown, err := look(ctx, settings, tenants, inv, key, stdout)
	phase := parityinvestigate.PhaseCompleted
	switch {
	case ctx.Err() != nil:
		phase = parityinvestigate.PhaseInterrupted
	case err != nil:
		phase = parityinvestigate.PhaseFailed
	}
	closing, cancel := context.WithTimeout(context.WithoutCancel(ctx), closeTimeout)
	defer cancel()
	if closeErr := audit.Emit(closing, session, phase, shown); closeErr != nil && err == nil {
		err = closeErr
	}
	return err
}

func tenantOf(tenants parityrun.Tenants, org string) (parityrun.Tenant, bool) {
	for _, t := range tenants.Tenants {
		if t.Org.StringValue() == org {
			return t, true
		}
	}
	return parityrun.Tenant{}, false
}

func identify(ctx context.Context, s parityrun.InvestigateSettings, fd string, stderr io.Writer) (parityinvestigate.Operator, error) {
	verifier, err := parityinvestigate.NewIdentityVerifier(ctx, parityinvestigate.IdentityConfig{
		Issuer: s.Issuer, Audience: s.Audience, GroupsClaim: s.GroupsClaim, Group: s.Group, MaxAge: s.MaxAge, ClockSkew: s.ClockSkew,
	})
	if err != nil {
		return parityinvestigate.Operator{}, err
	}
	token, err := readSecret(fd, "ID token: ", maxTokenBytes, stderr)
	if err != nil {
		return parityinvestigate.Operator{}, err
	}
	defer parityinvestigate.Wipe(token)
	return verifier.Verify(ctx, string(token))
}

func readKey(fd string, stderr io.Writer) ([]byte, error) {
	encoded, err := readSecret(fd, "Run key: ", maxKeyBytes, stderr)
	if err != nil {
		return nil, err
	}
	defer parityinvestigate.Wipe(encoded)
	key := make([]byte, base64.StdEncoding.DecodedLen(len(encoded)))
	n, err := base64.StdEncoding.Decode(key, encoded)
	if err != nil || n != parity.MinRunKeyBytes {
		parityinvestigate.Wipe(key)
		return nil, errors.Newf(errors.TypeInvalidInput, parityinvestigate.ErrCodeSecret, "the run key is not 32 bytes of base64")
	}
	return key[:n], nil
}

// newSession is the audit session of an investigation of w, its id drawn from random.
//
// # Errors
//
// A random source that fails.
func newSession(random io.Reader, operator parityinvestigate.Operator, runID, tenant string, class parity.WindowClass, w parity.Window) (parityinvestigate.Session, error) {
	var b [16]byte
	if _, err := io.ReadFull(random, b[:]); err != nil {
		return parityinvestigate.Session{}, errors.WrapInternalf(err, parityrun.ErrCodeInvestigation, "error drawing a session id")
	}
	return parityinvestigate.Session{
		ID: hex.EncodeToString(b[:]), Operator: operator, RunID: runID, Tenant: tenant, Class: string(class),
		Start: time.Unix(0, w.Start), End: time.Unix(0, w.End),
	}, nil
}

// investigationRound is the round an investigation plans again with: the round's own graphs and
// its dual-write health.
func investigationRound(round parityrun.Round, settings parityrun.Settings, tenants parityrun.Tenants) (parityrun.Round, error) {
	return withHealth(round, settings, tenants)
}

// look shows the tenant's differences behind the report.
func look(ctx context.Context, settings parityrun.Settings, tenants parityrun.Tenants, inv parityrun.Investigation, key []byte, stdout io.Writer) (int, error) {
	round, err := assemble(ctx, settings, tenants)
	if err != nil {
		return 0, err
	}
	if round, err = investigationRound(round, settings, tenants); err != nil {
		return 0, err
	}
	return round.Investigate(ctx, key, inv, stdout)
}
