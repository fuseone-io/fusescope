package pprof

import "github.com/fuseone-io/fusescope/pkg/factory"

// PProf is the interface that wraps the pprof service lifecycle.
type PProf interface {
	factory.Service
}
