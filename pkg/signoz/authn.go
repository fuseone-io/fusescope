package signoz

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/googlecallbackauthn"
	"github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/oidccallbackauthn"
	"github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/samlcallbackauthn"
	"github.com/fuseone-io/fusescope/pkg/authn/passwordauthn/emailpasswordauthn"
	"github.com/fuseone-io/fusescope/pkg/cache"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/licensing"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
)

func NewAuthNs(ctx context.Context, providerSettings factory.ProviderSettings, store authtypes.AuthNStore, licensing licensing.Licensing, globalConfig global.Config, cache cache.Cache) (map[authtypes.AuthNProvider]authn.AuthN, error) {
	emailPasswordAuthN := emailpasswordauthn.New(store)

	googleCallbackAuthN, err := googlecallbackauthn.New(ctx, store, providerSettings, globalConfig)
	if err != nil {
		return nil, err
	}

	oidcCallbackAuthN, err := oidccallbackauthn.New(ctx, store, providerSettings, globalConfig)
	if err != nil {
		return nil, err
	}

	samlCallbackAuthN, err := samlcallbackauthn.New(ctx, store, providerSettings, globalConfig, cache)
	if err != nil {
		return nil, err
	}

	return map[authtypes.AuthNProvider]authn.AuthN{
		authtypes.AuthNProviderEmailPassword: emailPasswordAuthN,
		authtypes.AuthNProviderGoogle:        googleCallbackAuthN,
		authtypes.AuthNProviderOIDC:          oidcCallbackAuthN,
		authtypes.AuthNProviderSAML:          samlCallbackAuthN,
	}, nil
}
