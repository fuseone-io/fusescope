package rumtypes

import (
	"strings"
	"testing"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewApplicationKey(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	key, plaintext, err := NewApplicationKey(valuer.GenerateUUID(), valuer.GenerateUUID(), now)
	require.NoError(t, err)

	assert.True(t, strings.HasPrefix(plaintext, KeyPrefix))
	assert.Len(t, plaintext, len(KeyPrefix)+32)
	assert.Equal(t, HashKey(plaintext), key.Hash)
	assert.NotContains(t, key.Hash, plaintext)
	assert.Equal(t, plaintext[len(plaintext)-4:], key.Last4)
	assert.Equal(t, KeyStatusActive, key.StatusAt(now))

	_, other, err := NewApplicationKey(valuer.GenerateUUID(), valuer.GenerateUUID(), now)
	require.NoError(t, err)
	assert.NotEqual(t, plaintext, other)
}

func TestHashKey(t *testing.T) {
	testCases := []struct {
		name  string
		left  string
		right string
		equal bool
	}{
		{name: "SameKey_SameHash", left: "rum_pub_aaaa", right: "rum_pub_aaaa", equal: true},
		{name: "DifferentKey_DifferentHash", left: "rum_pub_aaaa", right: "rum_pub_aaab", equal: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.equal, HashKey(testCase.left) == HashKey(testCase.right))
			assert.Len(t, HashKey(testCase.left), 64)
		})
	}
}

func TestIsWellFormedKey(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected bool
	}{
		{name: "Generated_Valid", input: "rum_pub_abcdefghijklmnopqrstuvwxyz234567", expected: true},
		{name: "WrongPrefix_Invalid", input: "rum_sec_abcdefghijklmnopqrstuvwxyz234567", expected: false},
		{name: "Empty_Invalid", input: "", expected: false},
		{name: "TooLong_Invalid", input: KeyPrefix + strings.Repeat("a", 200), expected: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, IsWellFormedKey(testCase.input))
		})
	}
}

func TestApplicationKeyStatusAt(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	future := now.Add(time.Hour)
	past := now.Add(-time.Second)

	testCases := []struct {
		name     string
		key      ApplicationKey
		expected KeyStatus
		usable   bool
	}{
		{name: "NoExpiry_Active", key: ApplicationKey{}, expected: KeyStatusActive, usable: true},
		{name: "FutureExpiry_Expiring", key: ApplicationKey{ExpiresAt: &future}, expected: KeyStatusExpiring, usable: true},
		{name: "PastExpiry_Expired", key: ApplicationKey{ExpiresAt: &past}, expected: KeyStatusExpired, usable: false},
		{name: "Revoked_Revoked", key: ApplicationKey{RevokedAt: &past}, expected: KeyStatusRevoked, usable: false},
		{name: "RevokedWithFutureExpiry_Revoked", key: ApplicationKey{ExpiresAt: &future, RevokedAt: &past}, expected: KeyStatusRevoked, usable: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.key.StatusAt(now))
			assert.Equal(t, testCase.usable, testCase.key.IsUsableAt(now))
		})
	}
}

func TestApplicationKeyRotateRevoke(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)

	testCases := []struct {
		name          string
		overlap       KeyOverlap
		usableAfter   time.Duration
		unusableAfter time.Duration
	}{
		{name: "OneHour", overlap: KeyOverlapOneHour, usableAfter: 59 * time.Minute, unusableAfter: time.Hour},
		{name: "OneDay", overlap: KeyOverlapOneDay, usableAfter: 23 * time.Hour, unusableAfter: 24 * time.Hour},
		{name: "SevenDays", overlap: KeyOverlapSevenDays, usableAfter: 167 * time.Hour, unusableAfter: 168 * time.Hour},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			key, _, err := NewApplicationKey(valuer.GenerateUUID(), valuer.GenerateUUID(), now)
			require.NoError(t, err)

			require.NoError(t, key.Expire(now, testCase.overlap))
			assert.Equal(t, KeyStatusExpiring, key.StatusAt(now))
			assert.True(t, key.IsUsableAt(now.Add(testCase.usableAfter)))
			assert.False(t, key.IsUsableAt(now.Add(testCase.unusableAfter)))

			key.Revoke(now.Add(time.Minute))
			assert.False(t, key.IsUsableAt(now.Add(2*time.Minute)))
			assert.Equal(t, KeyStatusRevoked, key.StatusAt(now.Add(2*time.Minute)))
		})
	}
}

func TestApplicationKeyExpireTwiceRejected(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	key, _, err := NewApplicationKey(valuer.GenerateUUID(), valuer.GenerateUUID(), now)
	require.NoError(t, err)

	require.NoError(t, key.Expire(now, KeyOverlapOneHour))
	err = key.Expire(now, KeyOverlapOneDay)
	require.Error(t, err)
	assert.True(t, errors.Ast(err, errors.TypeAlreadyExists))
}

func TestKeyOverlapUnmarshal(t *testing.T) {
	testCases := []struct {
		name     string
		input    string
		expected time.Duration
		fails    bool
	}{
		{name: "OneHour", input: `"1h"`, expected: time.Hour},
		{name: "OneDay", input: `"24h"`, expected: 24 * time.Hour},
		{name: "SevenDays", input: `"7d"`, expected: 7 * 24 * time.Hour},
		{name: "Unsupported_Fails", input: `"2h"`, fails: true},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var overlap KeyOverlap
			err := overlap.UnmarshalJSON([]byte(testCase.input))
			if testCase.fails {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, testCase.expected, overlap.Duration())
		})
	}
}
