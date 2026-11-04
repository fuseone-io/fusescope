package ingest

import (
	"context"
	"encoding/json"
	"log/slog"
	"maps"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestpolicy"
	"github.com/fuseone-io/fusescope-collector-server/components/pkg/ingestreport"
	"github.com/open-telemetry/opamp-go/protobufs"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	// retryEvery runs the assembler's retrier when no page arrives, so a
	// commit that failed is retried and expired assemblies are dropped.
	retryEvery = time.Second
	pruneEvery = time.Minute
)

// Reports takes the collectors' ingest report pages (the collector's
// docs/spec/rum.md §10.4): the assembler orders and bounds them, the store
// applies each complete report once, and only then is it acknowledged. A
// collector whose report shows an older policy than this replica holds, or
// one it could not persist, is sent the policy again (ADR 0010 line 64).
type Reports struct {
	assembler *ingestreport.Assembler
	store     *ReportStore
	hub       *Hub
	publisher *Publisher
	logger    *slog.Logger

	// policies holds the policy reported by sequences awaiting a commit by
	// the retrier, checked once it commits them: registered before the first
	// commit, so the retrier never commits one unregistered, and only for a
	// valid report, whose policy is a few bounded fields. Each leaves at its
	// sequence's commit or terminal failure, or past the commit deadline.
	mu       sync.Mutex
	policies map[string]reportedPolicy
}

type reportedPolicy struct {
	seq    uint64
	policy ingestreport.PolicyReport
	at     time.Time
}

func NewReports(store *ReportStore, hub *Hub, publisher *Publisher, logger *slog.Logger) *Reports {
	return &Reports{assembler: ingestreport.NewAssembler(store), store: store, hub: hub, publisher: publisher, logger: logger, policies: map[string]reportedPolicy{}}
}

// Receive takes one page from an authenticated agent on conn and returns
// the reportAck to answer it with, or nil. Only an agent the hub holds on
// conn, an ingress collector with the capability within the hub's bound, is
// read. It makes the assembler's store calls, each with its own deadline,
// on the caller's goroutine. The page's content is never logged: its
// strings come from the collector.
func (reports *Reports) Receive(agentID string, conn Connection, page []byte) *protobufs.CustomMessage {
	if !reports.hub.Accepts(agentID, conn) {
		return nil
	}
	report, committed, err := reports.assembler.Add(agentID, page)
	reports.committed(committed)
	switch {
	case errors.Is(err, ingestreport.ErrAlreadyApplied):
		if seq, ok := sequenceOf(page); ok {
			return ReportAck(seq)
		}
		return nil
	case err != nil:
		reports.logger.Warn("ingest report page refused; the collector sends its values again in its next report", slog.String("agent_id", agentID), slog.Int("bytes", len(page)), slog.String("reason", refusal(err)))
		return nil
	case report == nil:
		return nil // more pages to come
	}
	if validReport(report) {
		reports.awaiting(agentID, report.ReportSequence, report.Policy)
	}
	err = reports.assembler.Commit(agentID, report.ReportSequence)
	if !awaitsRetry(err) {
		reports.forget(agentID, report.ReportSequence)
	}
	if err != nil {
		reports.logger.Warn("ingest report not applied yet", slog.String("agent_id", agentID), slog.Uint64("report_sequence", report.ReportSequence), slog.String("reason", refusal(err)))
		return nil
	}
	reports.checkPolicy(agentID, report.Policy)
	return ReportAck(report.ReportSequence)
}

// Run retries failed commits and prunes old reports until ctx ends.
func (reports *Reports) Run(ctx context.Context) {
	retry := time.NewTicker(retryEvery)
	defer retry.Stop()
	prune := time.NewTicker(pruneEvery)
	defer prune.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-retry.C:
			reports.committed(reports.assembler.Retry())
			reports.expirePolicies(time.Now())
		case <-prune.C:
			pruneCtx, cancel := context.WithTimeout(ctx, ingestreport.StoreCallTimeout)
			if err := reports.store.Prune(pruneCtx); err != nil && ctx.Err() == nil {
				reports.logger.WarnContext(ctx, "ingest reports not pruned", errors.Attr(err))
			}
			cancel()
		}
	}
}

// awaiting keeps the policy a sequence reported until the retrier commits
// it; one per agent, as the assembler holds, within its bound.
func (reports *Reports) awaiting(agentID string, seq uint64, policy ingestreport.PolicyReport) {
	reports.mu.Lock()
	defer reports.mu.Unlock()
	if _, ok := reports.policies[agentID]; ok || len(reports.policies) < ingestreport.MaxAssemblies {
		reports.policies[agentID] = reportedPolicy{seq: seq, policy: policy, at: time.Now()}
	}
}

// forget drops the policy of seq, whose sequence no longer awaits a commit.
func (reports *Reports) forget(agentID string, seq uint64) {
	reports.mu.Lock()
	defer reports.mu.Unlock()
	if held, ok := reports.policies[agentID]; ok && held.seq == seq {
		delete(reports.policies, agentID)
	}
}

// policyHold is how long a held policy can still be needed: an attempt
// may start up to the commit deadline and run for a store call's deadline,
// and the retrier returns it at its next pass.
const policyHold = ingestreport.CommitDeadline + ingestreport.StoreCallTimeout + retryEvery

// expirePolicies drops the policies of sequences no attempt can commit any
// more, which the retrier invalidates without returning them.
func (reports *Reports) expirePolicies(now time.Time) {
	reports.mu.Lock()
	defer reports.mu.Unlock()
	maps.DeleteFunc(reports.policies, func(_ string, held reportedPolicy) bool {
		return now.Sub(held.at) > policyHold
	})
}

// awaitsRetry reports whether a sequence whose Commit returned err may still
// be committed by the retrier. Only success and an invalidation are known
// to end it; any other answer (a busy budget, a failed store call, or "not
// awaiting commit", which is also the answer while the retrier holds the
// attempt) keeps its policy until it commits or expires.
func awaitsRetry(err error) bool {
	return err != nil && !errors.Is(err, ingestreport.ErrInvalidSequence)
}

// committed acknowledges the sequences the retrier committed and checks
// the policy they reported.
func (reports *Reports) committed(committed []ingestreport.Committed) {
	for _, c := range committed {
		reports.hub.Ack(c.Agent, c.Seq)
		reports.mu.Lock()
		held, ok := reports.policies[c.Agent]
		if ok && held.seq <= c.Seq {
			delete(reports.policies, c.Agent)
		}
		reports.mu.Unlock()
		if ok && held.seq == c.Seq {
			reports.checkPolicy(c.Agent, held.policy)
		}
	}
}

// checkPolicy sends the policy again to a collector that holds an older one
// than this replica, whatever it reported of the last it received: a newer
// version may be accepted where an older was not. A collector that could
// not persist the current one gets it again too; that failure is transient.
func (reports *Reports) checkPolicy(agentID string, policy ingestreport.PolicyReport) {
	if policy.Status != "ok" { // its error is one of the policy's codes, validated with the report
		reports.logger.Warn("a collector did not accept the ingest policy", slog.String("agent_id", agentID), slog.Uint64("version", policy.Version), slog.String("error", policy.Error))
	}
	current := reports.publisher.Current()
	if current == nil {
		return
	}
	if policy.Version < current.Version || policy.Error == string(ingestpolicy.CodePersistError) {
		reports.hub.Send(agentID)
	}
}

// refusal is a stable class of a page or commit refused, fit for a log
// line: the assembler's and the store's messages may quote the collector's
// fields, IDs or values.
func refusal(err error) string {
	switch {
	case errors.Is(err, ingestreport.ErrApplying):
		return "applying"
	case errors.Is(err, ingestreport.ErrBusy):
		return "busy"
	case errors.Is(err, ingestreport.ErrStaleSequence):
		return "stale_sequence"
	case errors.Is(err, ingestreport.ErrInvalidSequence):
		return "invalid_sequence"
	case errors.Is(err, errNewAgentLimit):
		return "new_agent_limit"
	case errors.Is(err, context.DeadlineExceeded):
		return "store_timeout"
	case strings.HasPrefix(err.Error(), "agent record:"), strings.HasPrefix(err.Error(), "commit:"):
		return "store_error"
	default:
		return "invalid"
	}
}

// ReportAck is the acknowledgement of seq (§10.4).
func ReportAck(seq uint64) *protobufs.CustomMessage {
	data := []byte(`{"schemaVersion":1,"reportSequence":` + strconv.FormatUint(seq, 10) + `}`)
	return &protobufs.CustomMessage{Capability: ingestpolicy.Capability, Type: ingestpolicy.TypeReportAck, Data: data}
}

// sequenceOf reads the sequence of a page the assembler already decoded
// strictly, so no other value can be read here.
func sequenceOf(page []byte) (uint64, bool) {
	var header struct {
		ReportSequence uint64 `json:"reportSequence"`
	}
	if err := json.Unmarshal(page, &header); err != nil || header.ReportSequence == 0 {
		return 0, false
	}
	return header.ReportSequence, true
}
