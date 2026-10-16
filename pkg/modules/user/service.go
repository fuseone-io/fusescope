package user

import "github.com/fuseone-io/fusescope/pkg/factory"

type Service interface {
	factory.ServiceWithHealthy
}
