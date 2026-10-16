package types

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/stretchr/testify/assert"
)

func TestMustGenerateFactorPassword(t *testing.T) {
	assert.NotPanics(t, func() {
		MustGenerateFactorPassword(valuer.GenerateUUID().String())
	})
}
