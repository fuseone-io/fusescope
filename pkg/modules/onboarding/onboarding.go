package onboarding

import (
	"context"
	"net/http"

	"github.com/fuseone-io/fusescope/pkg/types/onboardingtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Module interface {
	// GetStatus reports what each requested signal received in the query's window.
	GetStatus(context.Context, onboardingtypes.StatusQuery) (*onboardingtypes.Status, error)

	// GetIngestion resolves the OTLP endpoints; requestHost is the last-resort host to derive them from.
	GetIngestion(ctx context.Context, orgID valuer.UUID, requestHost string) (*onboardingtypes.Ingestion, error)

	UpdateIngestion(ctx context.Context, orgID valuer.UUID, requestHost string, updatable *onboardingtypes.UpdatableIngestion) (*onboardingtypes.Ingestion, error)
}

type Handler interface {
	GetStatus(http.ResponseWriter, *http.Request)

	GetIngestion(http.ResponseWriter, *http.Request)

	UpdateIngestion(http.ResponseWriter, *http.Request)
}
