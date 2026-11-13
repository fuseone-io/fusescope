package integration

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestConfigValidate(t *testing.T) {
	testCases := []struct {
		name    string
		config  Config
		wantErr string
	}{
		{name: "DefaultIsOff", config: Config{ReconcileInterval: time.Minute}},
		{name: "BuiltinIDs", config: Config{AutoInstall: []string{"builtin-fusescope_collector", "builtin-aws_rds_mysql"}, ReconcileInterval: time.Minute}},
		{name: "IDWithSegments", config: Config{AutoInstall: []string{"builtin-aws-rds_mysql"}, ReconcileInterval: time.Minute}},
		{name: "NotBuiltin", config: Config{AutoInstall: []string{"custom-redis"}, ReconcileInterval: time.Minute}, wantErr: `"custom-redis" is not a built-in integration id`},
		{name: "Empty", config: Config{AutoInstall: []string{""}, ReconcileInterval: time.Minute}, wantErr: `"" is not a built-in integration id`},
		{name: "Duplicate", config: Config{AutoInstall: []string{"builtin-redis", "builtin-redis"}, ReconcileInterval: time.Minute}, wantErr: "builtin-redis is listed twice"},
		{name: "ZeroInterval", config: Config{}, wantErr: "integrations.reconcile_interval must be positive"},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.config.Validate()
			if tc.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			assert.ErrorContains(t, err, tc.wantErr)
		})
	}
}
