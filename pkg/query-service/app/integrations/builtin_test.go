package integrations

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuiltinIntegrations(t *testing.T) {
	require := require.New(t)

	repo := BuiltInIntegrations{}

	builtins, apiErr := repo.list(context.Background())
	require.Nil(apiErr)
	require.Greater(
		len(builtins), 0,
		"some built in integrations are expected to be bundled.",
	)

	nginxIntegrationId := "builtin-nginx"
	res, apiErr := repo.get(context.Background(), []string{
		nginxIntegrationId,
	})
	require.Nil(apiErr)

	nginxIntegration, exists := res[nginxIntegrationId]
	require.True(exists)
	require.False(strings.HasPrefix(nginxIntegration.Overview, "file://"))
}

func TestBuiltinIntegrationsUserFacingTextIsFuseScope(t *testing.T) {
	repo := BuiltInIntegrations{}
	builtins, apiErr := repo.list(context.Background())
	require.Nil(t, apiErr)
	require.NotEmpty(t, builtins)

	testCases := []struct {
		name      string
		forbidden string
	}{
		{name: "ProductName", forbidden: "SigNoz"},
		{name: "SigNozWebsite", forbidden: "signoz.io"},
		{name: "SigNozCloudHost", forbidden: "signoz.cloud"},
	}

	for _, integration := range builtins {
		texts := map[string]string{
			"title":       integration.Title,
			"description": integration.Description,
			"author":      integration.Author.Name + " " + integration.Author.Email + " " + integration.Author.HomePage,
			"overview":    integration.Overview,
		}
		for _, step := range integration.Configuration {
			texts["configuration/"+step.Title] = step.Instructions
		}

		for _, testCase := range testCases {
			t.Run(integration.Id+"_"+testCase.name, func(t *testing.T) {
				for field, text := range texts {
					assert.Falsef(t, strings.Contains(text, testCase.forbidden), "%s mentions %q", field, testCase.forbidden)
				}
			})
		}
	}
}
