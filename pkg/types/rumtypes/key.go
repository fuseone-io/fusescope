package rumtypes

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

// KeyPrefix starts every public application key. The rest is 20 random bytes
// in lowercase unpadded base32.
const KeyPrefix = "rum_pub_"

const (
	keyRandomBytes = 20
	maxKeyLength   = 128
)

var (
	ErrCodeKeyNotFound = errors.MustNewCode("rum_application_key_not_found")
	ErrCodeKeyConflict = errors.MustNewCode("rum_application_key_conflict")
	ErrCodeKeyInvalid  = errors.MustNewCode("rum_application_key_invalid")
)

var (
	KeyStatusActive   = KeyStatus{valuer.NewString("active")}
	KeyStatusExpiring = KeyStatus{valuer.NewString("expiring")}
	KeyStatusExpired  = KeyStatus{valuer.NewString("expired")}
	KeyStatusRevoked  = KeyStatus{valuer.NewString("revoked")}
)

var (
	KeyOverlapOneHour   = KeyOverlap{valuer.NewString("1h")}
	KeyOverlapOneDay    = KeyOverlap{valuer.NewString("24h")}
	KeyOverlapSevenDays = KeyOverlap{valuer.NewString("7d")}
)

var keyEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

type KeyStatus struct{ valuer.String }

// KeyOverlap is how long the previous key keeps working after a rotation.
type KeyOverlap struct{ valuer.String }

// ApplicationKey stores only the SHA-256 of the key: keys are 160 random bits,
// so an unsalted fast hash is enough to make a leaked table useless.
type ApplicationKey struct {
	bun.BaseModel `bun:"table:rum_application_key,alias:rum_application_key"`

	types.Identifiable
	types.TimeAuditable
	OrgID         valuer.UUID `bun:"org_id"`
	ApplicationID valuer.UUID `bun:"application_id"`
	Hash          string      `bun:"key_hash"`
	Last4         string      `bun:"last4"`
	ExpiresAt     *time.Time  `bun:"expires_at,nullzero"`
	RevokedAt     *time.Time  `bun:"revoked_at,nullzero"`
	LastUsedAt    *time.Time  `bun:"last_used_at,nullzero"`
}

type GettableApplicationKey struct {
	types.Identifiable
	ApplicationID valuer.UUID `json:"applicationId" required:"true"`
	Last4         string      `json:"last4" required:"true" description:"The last four characters of the key, for display."`
	Status        KeyStatus   `json:"status" required:"true"`
	CreatedAt     time.Time   `json:"createdAt" required:"true"`
	ExpiresAt     *time.Time  `json:"expiresAt" required:"true" nullable:"true"`
	LastUsedAt    *time.Time  `json:"lastUsedAt" required:"true" nullable:"true" description:"Updated in batches, about once a minute."`
}

// GettableCreatedApplicationKey is returned once, when a key is created or rotated.
type GettableCreatedApplicationKey struct {
	GettableApplicationKey
	Key string `json:"key" required:"true" description:"The full key. It is not stored and cannot be read again."`
}

type PostableRotateApplicationKey struct {
	Overlap KeyOverlap `json:"overlap" required:"true" description:"How long the current key keeps working."`
}

func (KeyStatus) Enum() []any {
	return []any{KeyStatusActive, KeyStatusExpiring}
}

func (KeyOverlap) Enum() []any {
	return []any{KeyOverlapOneHour, KeyOverlapOneDay, KeyOverlapSevenDays}
}

func (overlap KeyOverlap) Duration() time.Duration {
	switch overlap {
	case KeyOverlapOneHour:
		return time.Hour
	case KeyOverlapOneDay:
		return 24 * time.Hour
	case KeyOverlapSevenDays:
		return 7 * 24 * time.Hour
	}
	return 0
}

func (overlap *KeyOverlap) UnmarshalJSON(data []byte) error {
	var value valuer.String
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}

	candidate := KeyOverlap{value}
	if candidate.Duration() == 0 {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "overlap must be one of 1h, 24h or 7d, got %q", value.StringValue())
	}

	*overlap = candidate
	return nil
}

func NewApplicationKey(orgID valuer.UUID, applicationID valuer.UUID, now time.Time) (*ApplicationKey, string, error) {
	random := make([]byte, keyRandomBytes)
	if _, err := rand.Read(random); err != nil {
		return nil, "", errors.WrapInternalf(err, errors.CodeInternal, "failed to generate rum application key")
	}

	plaintext := KeyPrefix + strings.ToLower(keyEncoding.EncodeToString(random))

	return &ApplicationKey{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		OrgID:         orgID,
		ApplicationID: applicationID,
		Hash:          HashKey(plaintext),
		Last4:         plaintext[len(plaintext)-4:],
	}, plaintext, nil
}

func HashKey(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}

func IsWellFormedKey(plaintext string) bool {
	return len(plaintext) > len(KeyPrefix) && len(plaintext) <= maxKeyLength && strings.HasPrefix(plaintext, KeyPrefix)
}

func (key *ApplicationKey) StatusAt(now time.Time) KeyStatus {
	switch {
	case key.RevokedAt != nil:
		return KeyStatusRevoked
	case key.ExpiresAt == nil:
		return KeyStatusActive
	case now.Before(*key.ExpiresAt):
		return KeyStatusExpiring
	default:
		return KeyStatusExpired
	}
}

func (key *ApplicationKey) IsUsableAt(now time.Time) bool {
	status := key.StatusAt(now)
	return status == KeyStatusActive || status == KeyStatusExpiring
}

// Expire starts the overlap window of a rotation. A key that is already
// expiring cannot be rotated again.
func (key *ApplicationKey) Expire(now time.Time, overlap KeyOverlap) error {
	if key.StatusAt(now) != KeyStatusActive {
		return errors.Newf(errors.TypeAlreadyExists, ErrCodeKeyConflict, "rum application key %s is not active", key.ID.StringValue())
	}

	expiresAt := now.Add(overlap.Duration())
	key.ExpiresAt = &expiresAt
	key.UpdatedAt = now
	return nil
}

func (key *ApplicationKey) Revoke(now time.Time) {
	if key.RevokedAt != nil {
		return
	}

	key.RevokedAt = &now
	key.UpdatedAt = now
}

func NewGettableApplicationKey(key *ApplicationKey, now time.Time) *GettableApplicationKey {
	return &GettableApplicationKey{
		Identifiable:  key.Identifiable,
		ApplicationID: key.ApplicationID,
		Last4:         key.Last4,
		Status:        key.StatusAt(now),
		CreatedAt:     key.CreatedAt,
		ExpiresAt:     key.ExpiresAt,
		LastUsedAt:    key.LastUsedAt,
	}
}

func NewGettableApplicationKeys(keys []*ApplicationKey, now time.Time) []*GettableApplicationKey {
	gettables := make([]*GettableApplicationKey, 0, len(keys))
	for _, key := range keys {
		if key.IsUsableAt(now) {
			gettables = append(gettables, NewGettableApplicationKey(key, now))
		}
	}
	return gettables
}

func NewGettableCreatedApplicationKey(key *ApplicationKey, plaintext string, now time.Time) *GettableCreatedApplicationKey {
	return &GettableCreatedApplicationKey{GettableApplicationKey: *NewGettableApplicationKey(key, now), Key: plaintext}
}
