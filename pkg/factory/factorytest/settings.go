package factorytest

import (
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/instrumentation/instrumentationtest"
)

func NewSettings() factory.ProviderSettings {
	return instrumentationtest.New().ToProviderSettings()
}
