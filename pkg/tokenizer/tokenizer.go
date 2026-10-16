package tokenizer

import (
	"context"
	"time"

	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/statsreporter"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type Tokenizer interface {
	factory.Service
	// Create a new token.
	CreateToken(context.Context, *authtypes.Identity, map[string]string) (*authtypes.Token, error)

	// Get identity from token.
	GetIdentity(context.Context, string) (*authtypes.Identity, error)

	// Rotate the input token and return a new token.
	RotateToken(context.Context, string, string) (*authtypes.Token, error)

	// Delete the token by access token.
	DeleteToken(context.Context, string) error

	// Delete all tokens by userID.
	DeleteTokensByUserID(context.Context, valuer.UUID) error

	// Delete the identity by userID.
	DeleteIdentity(context.Context, valuer.UUID) error

	// Set the last observed at for an access token.
	SetLastObservedAt(context.Context, string, time.Time) error

	// Returns the config of the tokenizer.
	Config() Config

	// Gets the last observed at for each user in an org.
	ListMaxLastObservedAtByOrgID(context.Context, valuer.UUID) (map[valuer.UUID]time.Time, error)

	statsreporter.StatsCollector
}
