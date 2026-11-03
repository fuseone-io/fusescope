package ingest

import (
	"context"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// reviseBackoff is the first retry of a failed revision; it doubles up to
// pollEvery, after which the poll retries anyway.
const reviseBackoff = 250 * time.Millisecond

// Service revises the policy and drives the hub: at start; on a change
// here; when a poll finds a change recorded that no revision has read, or
// a version this replica does not hold (every pollEvery, which bounds a
// revocation's latency whichever replica took it, even one that stopped
// right after); after a failed revision, with backoff; and every
// resendEvery, which also drops keys whose overlap ended and resends to
// every agent regardless (ADR 0010 §3).
type Service struct {
	publisher *Publisher
	hub       *Hub
	logger    *slog.Logger
	changes   chan struct{}

	pollEvery, resendEvery time.Duration
}

func NewService(publisher *Publisher, hub *Hub, logger *slog.Logger) *Service {
	return &Service{publisher: publisher, hub: hub, logger: logger, changes: make(chan struct{}, 1), pollEvery: pollEvery, resendEvery: resendEvery}
}

// Changed asks for a revision; it never blocks.
func (service *Service) Changed() {
	select {
	case service.changes <- struct{}{}:
	default:
	}
}

// Run revises until ctx ends, then stops the hub's senders.
func (service *Service) Run(ctx context.Context) {
	defer service.hub.Close()
	poll := time.NewTicker(service.pollEvery)
	defer poll.Stop()
	resend := time.NewTicker(service.resendEvery)
	defer resend.Stop()

	var retry <-chan time.Time
	backoff := reviseBackoff
	revise := func(resend bool) {
		if service.revise(ctx, resend) {
			retry, backoff = nil, reviseBackoff
			return
		}
		retry = time.After(backoff/2 + rand.N(backoff/2+1))
		backoff = min(2*backoff, service.pollEvery)
	}

	revise(false)
	for {
		select {
		case <-ctx.Done():
			return
		case <-service.changes:
			revise(false)
		case <-retry:
			revise(false)
		case <-resend.C:
			revise(true)
		case <-poll.C:
			state, err := service.publisher.State(ctx)
			if err != nil {
				service.logger.WarnContext(ctx, "ingest policy state not read", errors.Attr(err))
				continue
			}
			current := service.publisher.Current()
			if state.Pending || current == nil || current.Version != state.Version {
				revise(false)
			}
		}
	}
}

// revise reports whether the revision succeeded.
func (service *Service) revise(ctx context.Context, resend bool) bool {
	changed, err := service.publisher.Revise(ctx)
	if err != nil {
		if ctx.Err() == nil {
			service.logger.ErrorContext(ctx, "ingest policy not revised; collectors keep the version they hold", errors.Attr(err))
		}
		if resend {
			service.hub.Broadcast()
		}
		return false
	}
	if changed {
		current := service.publisher.Current()
		service.logger.InfoContext(ctx, "ingest policy revised", slog.Uint64("version", current.Version), slog.Int("bytes", len(current.Data)))
	}
	if changed || resend {
		service.hub.Broadcast()
	}
	return true
}
