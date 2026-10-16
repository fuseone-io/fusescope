package cloudintegrationtypes

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

type CloudProviderType struct{ valuer.String }

var (
	// cloud providers.
	CloudProviderTypeAWS   = CloudProviderType{valuer.NewString("aws")}
	CloudProviderTypeAzure = CloudProviderType{valuer.NewString("azure")}
	CloudProviderTypeGCP   = CloudProviderType{valuer.NewString("gcp")}

	ErrCodeCloudProviderInvalidInput = errors.MustNewCode("cloud_integration_invalid_cloud_provider")
)

func NewCloudProvider(provider string) (CloudProviderType, error) {
	switch provider {
	case CloudProviderTypeAWS.StringValue():
		return CloudProviderTypeAWS, nil
	case CloudProviderTypeAzure.StringValue():
		return CloudProviderTypeAzure, nil
	case CloudProviderTypeGCP.StringValue():
		return CloudProviderTypeGCP, nil
	default:
		return CloudProviderType{}, errors.NewInvalidInputf(ErrCodeCloudProviderInvalidInput, "invalid cloud provider: %s", provider)
	}
}
