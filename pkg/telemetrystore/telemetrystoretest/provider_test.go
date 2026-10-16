package telemetrystoretest

import (
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/fuseone-io/fusescope/pkg/telemetrystore"
	"github.com/stretchr/testify/assert"
)

func TestNew(t *testing.T) {
	provider := New(telemetrystore.Config{Provider: "clickhouse"}, sqlmock.QueryMatcherRegexp)
	assert.NotNil(t, provider)
	assert.NotNil(t, provider.Mock())
	assert.NotNil(t, provider.ClickhouseDB())
}
