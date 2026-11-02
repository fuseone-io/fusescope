package alertmanagertypes

import (
	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/prometheus/alertmanager/config"
	amcommoncfg "github.com/prometheus/alertmanager/config/common"
	amopsgenie "github.com/prometheus/alertmanager/notify/opsgenie"
	commoncfg "github.com/prometheus/common/config"
)

type ChannelOpsgenieConfig struct {
	SendResolved *bool                        `json:"sendResolved,omitempty"`
	APIKey       string                       `json:"apiKey" required:"true" format:"password"`
	APIURL       string                       `json:"apiUrl"`
	Message      valuer.UnsetOrNonEmptyString `json:"message,omitzero"`
	Description  valuer.UnsetOrNonEmptyString `json:"description,omitzero"`
	Source       valuer.UnsetOrNonEmptyString `json:"source,omitzero"`
	Details      map[string]string            `json:"details,omitzero"`
	Priority     string                       `json:"priority"`
}

func (c *ChannelOpsgenieConfig) UnmarshalJSON(data []byte) error {
	type alias ChannelOpsgenieConfig
	if err := decodeStrict(data, (*alias)(c)); err != nil {
		return err
	}

	fillSendResolved(&c.SendResolved, amopsgenie.DefaultOpsGenieConfig.VSendResolved)
	c.Message.SetIfUnset(amopsgenie.DefaultOpsGenieConfig.Message)
	c.Description.SetIfUnset(amopsgenie.DefaultOpsGenieConfig.Description)
	c.Source.SetIfUnset(amopsgenie.DefaultOpsGenieConfig.Source)

	return c.Validate()
}

func (c ChannelOpsgenieConfig) Validate() error {
	if c.APIKey == "" {
		return errors.NewInvalidInputf(ErrCodeAlertmanagerChannelInvalid, "config.spec.apiKey is required for an opsgenie channel")
	}

	return nil
}

func (c ChannelOpsgenieConfig) toUndefaultedReceiver(displayName string) (*Receiver, error) {
	var apiURL *amcommoncfg.URL
	if c.APIURL != "" {
		parsed, err := parseUpstreamURL(c.APIURL)
		if err != nil {
			return nil, err
		}
		apiURL = parsed
	}

	return &Receiver{Receiver: &config.Receiver{
		Name: displayName,
		OpsGenieConfigs: []*amopsgenie.OpsGenieConfig{{
			NotifierConfig: amcommoncfg.NotifierConfig{VSendResolved: resolveSendResolved(c.SendResolved, amopsgenie.DefaultOpsGenieConfig.VSendResolved)},
			APIKey:         commoncfg.Secret(c.APIKey),
			APIURL:         apiURL,
			Message:        c.Message.StringValue(),
			Description:    c.Description.StringValue(),
			Source:         c.Source.StringValue(),
			Priority:       c.Priority,
			Details:        c.Details,
		}},
	}}, nil
}

func newChannelOpsgenieConfigFromReceiver(name string, receiver *Receiver) (ChannelSpec, error) {
	opsgenie := receiver.OpsGenieConfigs[0]
	sendResolved := opsgenie.VSendResolved

	if err := rejectAnyHTTPAuth(name, opsgenie.HTTPConfig); err != nil {
		return nil, err
	}

	return &ChannelOpsgenieConfig{
		SendResolved: &sendResolved,
		APIKey:       string(opsgenie.APIKey),
		APIURL:       formatUpstreamURL(opsgenie.APIURL),
		Message:      valuer.UnsetIfEmpty(opsgenie.Message),
		Description:  valuer.UnsetIfEmpty(opsgenie.Description),
		Source:       valuer.UnsetIfEmpty(opsgenie.Source),
		Priority:     opsgenie.Priority,
		Details:      opsgenie.Details,
	}, nil
}
