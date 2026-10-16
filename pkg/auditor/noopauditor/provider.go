package noopauditor

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/auditor"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/types/audittypes"
)

type provider struct {
	healthyC chan struct{}
	stopC    chan struct{}
}

func NewFactory() factory.ProviderFactory[auditor.Auditor, auditor.Config] {
	return factory.NewProviderFactory(factory.MustNewName("noop"), New)
}

func New(ctx context.Context, providerSettings factory.ProviderSettings, config auditor.Config) (auditor.Auditor, error) {
	return &provider{
		healthyC: make(chan struct{}),
		stopC:    make(chan struct{}),
	}, nil
}

func (p *provider) Start(_ context.Context) error {
	close(p.healthyC)
	<-p.stopC
	return nil
}

func (p *provider) Stop(_ context.Context) error {
	close(p.stopC)
	return nil
}

func (p *provider) Healthy() <-chan struct{} {
	return p.healthyC
}

func (p *provider) Audit(_ context.Context, _ audittypes.AuditEvent) {}
