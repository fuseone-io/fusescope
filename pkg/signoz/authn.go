package signoz

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/authn"
	"github.com/fuseone-io/fusescope/pkg/authn/callbackauthn/googlecallbackauthn"
	"github.com/fuseone-io/fusescope/pkg/authn/passwordauthn/emailpasswordauthn"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/global"
	"github.com/fuseone-io/fusescope/pkg/licensing"
	"github.com/fuseone-io/fusescope/pkg/types/authtypes"
)

func NewAuthNs(ctx context.Context, providerSettings factory.ProviderSettings, store authtypes.AuthNStore, licensing licensing.Licensing, globalConfig global.Config) (map[authtypes.AuthNProvider]authn.AuthN, error) {
	emailPasswordAuthN := emailpasswordauthn.New(store)

	googleCallbackAuthN, err := googlecallbackauthn.New(ctx, store, providerSettings, globalConfig)
	if err != nil {
		return nil, err
	}

	return map[authtypes.AuthNProvider]authn.AuthN{
		authtypes.AuthNProviderEmailPassword: emailPasswordAuthN,
		authtypes.AuthNProviderGoogle:        googleCallbackAuthN,
	}, nil
}
