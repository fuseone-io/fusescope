package meterreporter

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
)

var (
	ErrCodeInvalidInput = errors.MustNewCode("meterreporter_invalid_input")
)

type Reporter interface {
	factory.ServiceWithHealthy
}
