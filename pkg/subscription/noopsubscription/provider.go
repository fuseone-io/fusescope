package noopsubscription

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/subscription"
	"github.com/fuseone-io/fusescope/pkg/types/subscriptiontypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type provider struct{}

func New() subscription.Subscription {
	return &provider{}
}

func (provider *provider) Create(context.Context, valuer.UUID, *subscriptiontypes.PostableSubscription) (*subscriptiontypes.GettableSubscription, error) {
	return nil, errors.New(errors.TypeUnsupported, subscription.ErrCodeUnsupported, "creating a subscription is not supported")
}

func (provider *provider) Update(context.Context, valuer.UUID, *subscriptiontypes.PostableSubscription) (*subscriptiontypes.GettableSubscription, error) {
	return nil, errors.New(errors.TypeUnsupported, subscription.ErrCodeUnsupported, "updating a subscription is not supported")
}

func (provider *provider) Get(context.Context, valuer.UUID) (*subscriptiontypes.GettableSubscriptionUsage, error) {
	return nil, errors.New(errors.TypeUnsupported, subscription.ErrCodeUnsupported, "fetching the subscription is not supported")
}
