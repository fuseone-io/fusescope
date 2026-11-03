package ingest

import (
	"context"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// Service revises the policy and drives the hub: at start, on a change in
// this replica, when another replica issued a version (checked every
// pollEvery, which bounds revocation latency across replicas), and every
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

	// seen is the version in the database at the last revision, so a
	// failing revision is retried on a change, not on every poll.
	seen := service.revise(ctx, false)
	for {
		select {
		case <-ctx.Done():
			return
		case <-service.changes:
			seen = service.revise(ctx, false)
		case <-resend.C:
			seen = service.revise(ctx, true)
		case <-poll.C:
			version, err := service.publisher.PublishedVersion(ctx)
			if err != nil {
				service.logger.WarnContext(ctx, "ingest policy version not read", errors.Attr(err))
				continue
			}
			if version != seen {
				seen = service.revise(ctx, false)
			}
		}
	}
}

func (service *Service) revise(ctx context.Context, resend bool) uint64 {
	changed, err := service.publisher.Revise(ctx)
	if err != nil {
		service.logger.ErrorContext(ctx, "ingest policy not revised; collectors keep the version they hold", errors.Attr(err))
	}
	if changed || resend {
		service.hub.Broadcast()
	}
	if current := service.publisher.Current(); current != nil {
		if changed {
			service.logger.InfoContext(ctx, "ingest policy revised", "version", current.Version, "bytes", len(current.Data))
		}
		return current.Version
	}
	version, _ := service.publisher.PublishedVersion(ctx)
	return version
}
