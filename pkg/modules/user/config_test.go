package user

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/config/fileprovider"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExampleConfigMatchesDefaults(t *testing.T) {
	conf, err := fileprovider.New(config.ProviderConfig{}).Get(context.Background(), config.MustNewUri("file:"+filepath.Join("..", "..", "..", "conf", "example.yaml")))
	require.NoError(t, err)

	example := PasswordConfig{}
	require.NoError(t, conf.Unmarshal("user::password", &example))

	defaults, ok := newConfig().(*Config)
	require.True(t, ok)

	testCases := []struct {
		name     string
		expected any
		actual   any
	}{
		{
			name:     "PasswordResetAllowSelf",
			expected: defaults.Password.Reset.AllowSelf,
			actual:   example.Reset.AllowSelf,
		},
		{
			name:     "PasswordResetMaxTokenLifetime",
			expected: defaults.Password.Reset.MaxTokenLifetime,
			actual:   example.Reset.MaxTokenLifetime,
		},
		{
			name:     "PasswordInviteMaxTokenLifetime",
			expected: defaults.Password.Invite.MaxTokenLifetime,
			actual:   example.Invite.MaxTokenLifetime,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.actual)
		})
	}
}
