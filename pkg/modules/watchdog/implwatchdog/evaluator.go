package implwatchdog

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel/metric"

	"github.com/fuseone-io/fusescope/pkg/anomaly/anomalyquerier"
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/modules/watchdog"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
	"github.com/fuseone-io/fusescope/pkg/types/watchdogtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

// orgEvaluator runs the detectors of one organization for one window, under
// one anomaly session.
type orgEvaluator struct {
	logger            *slog.Logger
	evaluator         *anomalyquerier.Evaluator
	exceptionReader   exceptionReader
	module            watchdog.Module
	maxSeries         int
	activeOverflow    metric.Int64Counter
	exceptionOverflow metric.Int64Counter
}

// orgRun is one organization's evaluation of one window.
type orgRun struct {
	*orgEvaluator
	session   *anomalyquerier.Session
	orgID     valuer.UUID
	window    watchdogtypes.Window
	detectors []watchdogtypes.Detector
	// active holds the services with an active issue, by enabled detector.
	active map[watchdogtypes.Detector]map[string]bool
	// dormant are the active issues of disabled RED detectors.
	dormant []*watchdogtypes.Issue
	// evaluated holds the active issues an evaluation was applied to.
	evaluated         map[watchdogtypes.Detector]map[string]bool
	cursors           *exceptionCursors
	exceptionsEnabled bool
	readExceptions    bool
	mutedExceptions   []*watchdogtypes.Issue
}

func newOrgEvaluator(providerSettings factory.ProviderSettings, evaluator *anomalyquerier.Evaluator, exceptionReader exceptionReader, module watchdog.Module, maxSeries int) (*orgEvaluator, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/modules/watchdog/implwatchdog")
	activeOverflow, err := settings.Meter().Int64Counter("fusescope.watchdog.active_overflow", metric.WithDescription("Active services above max_series, evaluated in extra batches."))
	if err != nil {
		return nil, err
	}
	exceptionOverflow, err := settings.Meter().Int64Counter("fusescope.watchdog.exception_overflow", metric.WithDescription("Cycles with more new exception groups than one batch."))
	if err != nil {
		return nil, err
	}
	return &orgEvaluator{logger: settings.Logger(), evaluator: evaluator, exceptionReader: exceptionReader, module: module, maxSeries: maxSeries, activeOverflow: activeOverflow, exceptionOverflow: exceptionOverflow}, nil
}

// newSession returns the evaluation of a lease session, which keeps the
// new_exception cursors of its organizations.
func (e *orgEvaluator) newSession() evaluateFunc {
	cursors := newExceptionCursors()
	return func(ctx context.Context, orgID valuer.UUID, window watchdogtypes.Window) error {
		return e.evaluate(ctx, orgID, window, cursors)
	}
}

// evaluate gives every active issue left unevaluated by a failed query
// no-data, so an expired mute still reopens; the other batches still run
// unless the context ends or the session's limits are exceeded.
func (e *orgEvaluator) evaluate(ctx context.Context, orgID valuer.UUID, window watchdogtypes.Window, cursors *exceptionCursors) error {
	run := &orgRun{orgEvaluator: e, orgID: orgID, window: window, evaluated: map[watchdogtypes.Detector]map[string]bool{}, cursors: cursors}
	if err := run.load(ctx); err != nil {
		return err
	}
	failed := errors.Join(run.evaluateDormant(ctx), run.evaluateMutedExceptions(ctx))
	run.readExceptions = run.exceptionsDue()
	if len(run.detectors) == 0 && !run.readExceptions {
		return failed
	}
	failed = errors.Join(failed, run.evaluateCohort(ctx))
	if ctx.Err() == nil {
		failed = errors.Join(failed, run.evaluateUnevaluated(ctx))
	}
	return failed
}

func (run *orgRun) evaluateCohort(ctx context.Context) error {
	session, err := run.evaluator.Admit(ctx, anomalyquerier.Wait)
	if err != nil {
		return err
	}
	defer session.Close()
	run.session = session

	seasons, err := run.baselines(ctx, func(k int) *qbtypes.QueryRangeRequest {
		return watchdogtypes.NewDiscoveryRequest(run.window, k, run.maxSeries)
	})
	if err != nil {
		return err
	}
	var failed error
	if run.readExceptions {
		failed = run.evaluateExceptions(ctx, seasons)
	}
	if len(run.detectors) == 0 {
		return failed
	}
	cohort := watchdogtypes.NewCohort(run.window, run.activeServices(), seasons, run.maxSeries)
	if cohort.ActiveOverflow > 0 {
		run.logger.WarnContext(ctx, "active watchdog services exceed max_series, evaluating extra batches", slog.String("org_id", run.orgID.StringValue()), slog.Int("overflow", cohort.ActiveOverflow), slog.Int("max_series", run.maxSeries))
		run.activeOverflow.Add(ctx, int64(cohort.ActiveOverflow))
	}

	for _, batch := range cohort.Batches {
		err := run.evaluateBatch(ctx, batch, seasons)
		if err != nil && (ctx.Err() != nil || errors.Ast(err, errors.TypePayloadTooLarge)) {
			return errors.Join(failed, err)
		}
		failed = errors.Join(failed, err)
	}
	return failed
}

func (run *orgRun) load(ctx context.Context) error {
	settings, err := run.module.ListSettings(ctx, run.orgID)
	if err != nil {
		return err
	}
	for _, setting := range settings {
		switch {
		case setting.Detector == watchdogtypes.DetectorNewException:
			run.exceptionsEnabled = setting.Enabled
		case setting.Enabled:
			run.detectors = append(run.detectors, setting.Detector)
		}
	}
	issues, err := run.module.ListActiveIssues(ctx, run.orgID)
	if err != nil {
		return err
	}
	run.active = map[watchdogtypes.Detector]map[string]bool{}
	for _, detector := range run.detectors {
		run.active[detector] = map[string]bool{}
	}
	for _, issue := range issues {
		services, enabled := run.active[issue.Detector]
		switch {
		case enabled:
			services[issue.Service] = true
		case issue.Detector.IsRED():
			run.dormant = append(run.dormant, issue)
		case issue.Status == watchdogtypes.StatusMuted:
			run.mutedExceptions = append(run.mutedExceptions, issue)
		}
	}
	return nil
}

func (run *orgRun) activeServices() []string {
	services := make([]string, 0)
	for _, byService := range run.active {
		for service := range byService {
			services = append(services, service)
		}
	}
	return services
}

func (run *orgRun) baselines(ctx context.Context, request func(k int) *qbtypes.QueryRangeRequest) ([]*watchdogtypes.REDResult, error) {
	seasons := make([]*watchdogtypes.REDResult, watchdogtypes.Seasons)
	for k := range seasons {
		resp, err := run.session.Run(ctx, run.orgID, request(k+1))
		if err != nil {
			return nil, err
		}
		seasons[k] = watchdogtypes.ParseRED(resp)
	}
	return seasons, nil
}

// evaluateBatch queries the batch's current window, and the baselines of
// the active services discovery may have cut, then evaluates every service
// of the batch with every enabled detector. A failed issue write does not
// stop the others.
func (run *orgRun) evaluateBatch(ctx context.Context, batch watchdogtypes.Batch, seasons []*watchdogtypes.REDResult) error {
	resp, err := run.session.Run(ctx, run.orgID, watchdogtypes.NewCurrentRequest(run.window, batch.Services))
	if err != nil {
		return err
	}
	current := watchdogtypes.ParseRED(resp)
	refetched := map[string][]*watchdogtypes.REDSeries{}
	if len(batch.Refetch) > 0 {
		extra, err := run.baselines(ctx, func(k int) *qbtypes.QueryRangeRequest {
			return watchdogtypes.NewBaselineRequest(run.window, k, batch.Refetch)
		})
		if err != nil {
			return err
		}
		for _, service := range batch.Refetch {
			refetched[service] = watchdogtypes.BaselinesOf(extra, service)
		}
	}

	var failed error
	now := time.Now()
	for _, service := range batch.Services {
		baselines, ok := refetched[service]
		if !ok {
			baselines = watchdogtypes.BaselinesOf(seasons, service)
		}
		input := watchdogtypes.REDInput{Window: run.window, Service: service, Current: current.Services[service], Baselines: baselines, Warnings: current.Warnings}
		for _, detector := range run.detectors {
			failed = errors.Join(failed, run.evaluateService(ctx, detector, input, now))
		}
	}
	return failed
}

// evaluateDormant applies no-data to the issues of disabled detectors,
// without querying, so an expired mute still reopens them.
func (run *orgRun) evaluateDormant(ctx context.Context) error {
	var failed error
	now := time.Now()
	for _, issue := range run.dormant {
		failed = errors.Join(failed, run.apply(ctx, watchdogtypes.Evaluation{
			OrgID:    run.orgID,
			Detector: issue.Detector,
			Service:  issue.Service,
			Outcome:  watchdogtypes.OutcomeNoData,
			End:      run.window.End,
			Now:      now,
		}))
	}
	return failed
}

// evaluateUnevaluated applies no-data to the active issues no query
// reached.
func (run *orgRun) evaluateUnevaluated(ctx context.Context) error {
	var failed error
	now := time.Now()
	for detector, services := range run.active {
		for service := range services {
			if run.evaluated[detector][service] {
				continue
			}
			failed = errors.Join(failed, run.apply(ctx, watchdogtypes.Evaluation{
				OrgID:    run.orgID,
				Detector: detector,
				Service:  service,
				Outcome:  watchdogtypes.OutcomeNoData,
				End:      run.window.End,
				Now:      now,
			}))
		}
	}
	return failed
}

// evaluateService writes an evaluation only when it can change an issue: an
// anomaly, or any outcome for a service with an active issue.
func (run *orgRun) evaluateService(ctx context.Context, detector watchdogtypes.Detector, input watchdogtypes.REDInput, now time.Time) error {
	verdict, err := watchdogtypes.DetectRED(detector, input)
	if err != nil {
		return err
	}
	if verdict.Outcome != watchdogtypes.OutcomeAnomalous && !run.active[detector][input.Service] {
		return nil
	}
	if run.active[detector][input.Service] {
		if run.evaluated[detector] == nil {
			run.evaluated[detector] = map[string]bool{}
		}
		run.evaluated[detector][input.Service] = true
	}
	if verdict.Evidence != nil {
		query, err := json.Marshal(watchdogtypes.NewCurrentRequest(run.window, []string{input.Service}))
		if err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't encode the watchdog evidence query")
		}
		verdict.Evidence.Query = query
	}
	return run.apply(ctx, watchdogtypes.Evaluation{
		OrgID:     run.orgID,
		Detector:  detector,
		Service:   input.Service,
		Outcome:   verdict.Outcome,
		End:       run.window.End,
		Evidence:  verdict.Evidence,
		PeakScore: verdict.PeakScore,
		Now:       now,
	})
}

func (run *orgRun) apply(ctx context.Context, evaluation watchdogtypes.Evaluation) error {
	_, err := run.module.Evaluate(ctx, evaluation)
	if err != nil {
		run.logger.ErrorContext(ctx, "couldn't apply a watchdog evaluation", slog.String("org_id", run.orgID.StringValue()), slog.String("detector", evaluation.Detector.StringValue()), errors.Attr(err))
	}
	return err
}
