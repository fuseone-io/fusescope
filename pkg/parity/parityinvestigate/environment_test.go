package parityinvestigate

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func environ(vars map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := vars[k]; return v, ok }
}

var inCluster = map[string]string{"KUBERNETES_SERVICE_HOST": "10.0.0.1"}

func TestAnInvestigationRunsInTheClusterOnATerminalOnly(t *testing.T) {
	assert.NoError(t, CheckEnvironment(environ(inCluster), true, true))

	cases := map[string]struct {
		vars     map[string]string
		terminal bool
		token    bool
	}{
		"in CI":               {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "CI": "true"}, terminal: true, token: true},
		"in GitHub Actions":   {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "GITHUB_ACTIONS": "true"}, terminal: true, token: true},
		"an empty CI":         {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "CI": ""}, terminal: true, token: true},
		"no terminal":         {vars: inCluster, terminal: false, token: true},
		"outside the cluster": {vars: map[string]string{}, terminal: true, token: true},
		"no service account":  {vars: inCluster, terminal: true, token: false},
		"ambient AWS keys":    {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "AWS_ACCESS_KEY_ID": "AKIA"}, terminal: true, token: true},
		"an ambient secret":   {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "AWS_SECRET_ACCESS_KEY": "s"}, terminal: true, token: true},
		"an ambient session":  {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "AWS_SESSION_TOKEN": "s"}, terminal: true, token: true},
		"an ambient profile":  {vars: map[string]string{"KUBERNETES_SERVICE_HOST": "x", "AWS_PROFILE": "ops"}, terminal: true, token: true},
	}
	for name, c := range cases {
		assert.Error(t, CheckEnvironment(environ(c.vars), c.terminal, c.token), name)
	}
}
