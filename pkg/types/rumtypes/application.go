package rumtypes

import (
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

const (
	maxNameLength        = 128
	maxEnvironmentLength = 64
	maxListLength        = 50
	anyOrigin            = "*"
)

var (
	ErrCodeApplicationInvalidInput  = errors.MustNewCode("rum_application_invalid_input")
	ErrCodeApplicationNotFound      = errors.MustNewCode("rum_application_not_found")
	ErrCodeApplicationAlreadyExists = errors.MustNewCode("rum_application_already_exists")
)

var (
	PlatformWeb     = Platform{valuer.NewString("web")}
	PlatformAndroid = Platform{valuer.NewString("android")}
	PlatformIOS     = Platform{valuer.NewString("ios")}
)

// Platform is the kind of client an application ingests from. Only web is
// accepted today; android and ios are reserved.
type Platform struct{ valuer.String }

type Application struct {
	types.Identifiable
	types.TimeAuditable
	OrgID                valuer.UUID       `json:"orgId" required:"true"`
	Name                 string            `json:"name" required:"true"`
	Platform             Platform          `json:"platform" required:"true"`
	Environment          string            `json:"environment" required:"true"`
	AllowedOrigins       []string          `json:"allowedOrigins" required:"true" description:"Browser origins allowed to ingest, e.g. https://shop.example.com or https://*.example.com; * allows any."`
	TracePropagationURLs []string          `json:"tracePropagationUrls" required:"true" description:"URL prefixes of APIs the SDK sends traceparent to."`
	SampleRate           float64           `json:"sampleRate" required:"true" description:"Fraction of sessions the SDK records, from 0 to 1."`
	PIIPolicy            PIIPolicy         `json:"piiPolicy" required:"true"`
	CreatedBy            string            `json:"createdBy" required:"true"`
	FirstSeenAt          *time.Time        `json:"firstSeenAt" required:"true" nullable:"true" description:"When the gateway first accepted data for the application."`
	SourceMaps           SourceMapSettings `json:"sourceMaps" required:"true"`
}

type StorableApplication struct {
	bun.BaseModel `bun:"table:rum_application,alias:rum_application"`

	types.Identifiable
	types.TimeAuditable
	OrgID       valuer.UUID `bun:"org_id"`
	Name        string      `bun:"name"`
	Platform    Platform    `bun:"platform"`
	Environment string      `bun:"environment"`
	Data        string      `bun:"data"`
	CreatedBy   string      `bun:"created_by"`
	FirstSeenAt *time.Time  `bun:"first_seen_at,nullzero"`
}

type PostableApplication struct {
	Name                 string            `json:"name" required:"true"`
	Platform             Platform          `json:"platform" required:"true"`
	Environment          string            `json:"environment" required:"true"`
	AllowedOrigins       []string          `json:"allowedOrigins"`
	TracePropagationURLs []string          `json:"tracePropagationUrls"`
	SampleRate           float64           `json:"sampleRate" description:"Defaults to 1."`
	PIIPolicy            PIIPolicy         `json:"piiPolicy" description:"dropQuery defaults to true."`
	SourceMaps           SourceMapSettings `json:"sourceMaps"`
}

// UpdatableApplication replaces everything but the platform, which the keys
// and the snippet depend on.
type UpdatableApplication struct {
	Name                 string             `json:"name" required:"true"`
	Environment          string             `json:"environment" required:"true"`
	AllowedOrigins       []string           `json:"allowedOrigins"`
	TracePropagationURLs []string           `json:"tracePropagationUrls"`
	SampleRate           float64            `json:"sampleRate" description:"Defaults to 1."`
	PIIPolicy            PIIPolicy          `json:"piiPolicy" description:"dropQuery defaults to true."`
	SourceMaps           *SourceMapSettings `json:"sourceMaps" description:"Kept when omitted."`
}

// GettableCreatedApplication carries the first key, shown once.
type GettableCreatedApplication struct {
	Application
	Key *GettableCreatedApplicationKey `json:"key" required:"true"`
}

func (Platform) Enum() []any {
	return []any{PlatformWeb, PlatformAndroid, PlatformIOS}
}

func NewApplication(orgID valuer.UUID, createdBy string, postable *PostableApplication) *Application {
	now := time.Now()
	return &Application{
		Identifiable:         types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable:        types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		OrgID:                orgID,
		Name:                 postable.Name,
		Platform:             postable.Platform,
		Environment:          postable.Environment,
		AllowedOrigins:       postable.AllowedOrigins,
		TracePropagationURLs: postable.TracePropagationURLs,
		SampleRate:           postable.SampleRate,
		PIIPolicy:            postable.PIIPolicy,
		CreatedBy:            createdBy,
		SourceMaps:           postable.SourceMaps,
	}
}

func (app *Application) Update(updatable *UpdatableApplication) error {
	app.Name = updatable.Name
	app.Environment = updatable.Environment
	app.AllowedOrigins = updatable.AllowedOrigins
	app.TracePropagationURLs = updatable.TracePropagationURLs
	app.SampleRate = updatable.SampleRate
	app.PIIPolicy = updatable.PIIPolicy
	if updatable.SourceMaps != nil {
		app.SourceMaps = *updatable.SourceMaps
	}
	app.UpdatedAt = time.Now()
	return app.Validate()
}

func (app *Application) Validate() error {
	if err := validatePlatform(app.Platform); err != nil {
		return err
	}
	if err := validateSettings(app.Name, app.Environment, app.AllowedOrigins, app.TracePropagationURLs, app.SampleRate, app.PIIPolicy); err != nil {
		return err
	}
	return app.SourceMaps.Validate()
}

// AllowsOrigin matches an Origin header against the allowed origins. A
// wildcard entry matches subdomains only, never the apex.
func (app *Application) AllowsOrigin(origin string) bool {
	candidate, err := url.Parse(strings.ToLower(origin))
	if err != nil || candidate.Scheme == "" || candidate.Host == "" {
		return false
	}

	for _, entry := range app.AllowedOrigins {
		if entry == anyOrigin {
			return true
		}

		allowed, err := url.Parse(strings.ToLower(entry))
		if err != nil || allowed.Scheme != candidate.Scheme || allowed.Port() != candidate.Port() {
			continue
		}

		if suffix, ok := strings.CutPrefix(allowed.Hostname(), "*"); ok {
			if strings.HasSuffix(candidate.Hostname(), suffix) && len(candidate.Hostname()) > len(suffix) {
				return true
			}
			continue
		}

		if allowed.Hostname() == candidate.Hostname() {
			return true
		}
	}

	return false
}

func NewStorableApplication(app *Application) (*StorableApplication, error) {
	data, err := json.Marshal(storableApplicationData{
		AllowedOrigins:       app.AllowedOrigins,
		TracePropagationURLs: app.TracePropagationURLs,
		SampleRate:           app.SampleRate,
		PIIPolicy:            app.PIIPolicy,
		SourceMaps:           &app.SourceMaps,
	})
	if err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to encode rum application %s", app.ID.StringValue())
	}

	return &StorableApplication{
		Identifiable:  app.Identifiable,
		TimeAuditable: app.TimeAuditable,
		OrgID:         app.OrgID,
		Name:          app.Name,
		Platform:      app.Platform,
		Environment:   app.Environment,
		Data:          string(data),
		CreatedBy:     app.CreatedBy,
		FirstSeenAt:   app.FirstSeenAt,
	}, nil
}

func NewApplicationFromStorable(storable *StorableApplication) (*Application, error) {
	data := storableApplicationData{}
	if err := json.Unmarshal([]byte(storable.Data), &data); err != nil {
		return nil, errors.WrapInternalf(err, errors.CodeInternal, "failed to decode rum application %s", storable.ID.StringValue())
	}
	data.normalize()

	return &Application{
		Identifiable:         storable.Identifiable,
		TimeAuditable:        storable.TimeAuditable,
		OrgID:                storable.OrgID,
		Name:                 storable.Name,
		Platform:             storable.Platform,
		Environment:          storable.Environment,
		AllowedOrigins:       data.AllowedOrigins,
		TracePropagationURLs: data.TracePropagationURLs,
		SampleRate:           data.SampleRate,
		PIIPolicy:            data.PIIPolicy,
		CreatedBy:            storable.CreatedBy,
		FirstSeenAt:          storable.FirstSeenAt,
		SourceMaps:           *data.SourceMaps,
	}, nil
}

func NewApplicationsFromStorables(storables []*StorableApplication) ([]*Application, error) {
	apps := make([]*Application, 0, len(storables))
	for _, storable := range storables {
		app, err := NewApplicationFromStorable(storable)
		if err != nil {
			return nil, err
		}
		apps = append(apps, app)
	}
	return apps, nil
}

func (postable *PostableApplication) UnmarshalJSON(data []byte) error {
	type alias PostableApplication
	temp := alias{SampleRate: 1, PIIPolicy: NewDefaultPIIPolicy(), SourceMaps: NewDefaultSourceMapSettings()}
	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}

	normalizeSettings(&temp.Name, &temp.Environment, &temp.AllowedOrigins, &temp.TracePropagationURLs, &temp.PIIPolicy)
	if err := validatePlatform(temp.Platform); err != nil {
		return err
	}
	if err := validateSettings(temp.Name, temp.Environment, temp.AllowedOrigins, temp.TracePropagationURLs, temp.SampleRate, temp.PIIPolicy); err != nil {
		return err
	}

	*postable = PostableApplication(temp)
	return nil
}

func (updatable *UpdatableApplication) UnmarshalJSON(data []byte) error {
	type alias UpdatableApplication
	temp := alias{SampleRate: 1, PIIPolicy: NewDefaultPIIPolicy()}
	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}

	normalizeSettings(&temp.Name, &temp.Environment, &temp.AllowedOrigins, &temp.TracePropagationURLs, &temp.PIIPolicy)
	if err := validateSettings(temp.Name, temp.Environment, temp.AllowedOrigins, temp.TracePropagationURLs, temp.SampleRate, temp.PIIPolicy); err != nil {
		return err
	}

	*updatable = UpdatableApplication(temp)
	return nil
}

type storableApplicationData struct {
	AllowedOrigins       []string           `json:"allowedOrigins"`
	TracePropagationURLs []string           `json:"tracePropagationUrls"`
	SampleRate           float64            `json:"sampleRate"`
	PIIPolicy            PIIPolicy          `json:"piiPolicy"`
	SourceMaps           *SourceMapSettings `json:"sourceMaps,omitempty"`
}

func (data *storableApplicationData) normalize() {
	if data.AllowedOrigins == nil {
		data.AllowedOrigins = []string{}
	}
	if data.TracePropagationURLs == nil {
		data.TracePropagationURLs = []string{}
	}
	data.PIIPolicy.normalize()
	if data.SourceMaps == nil {
		defaults := NewDefaultSourceMapSettings()
		data.SourceMaps = &defaults
	}
}

func normalizeSettings(name *string, environment *string, origins *[]string, propagation *[]string, policy *PIIPolicy) {
	*name = strings.TrimSpace(*name)
	*environment = strings.TrimSpace(*environment)
	if *origins == nil {
		*origins = []string{}
	}
	if *propagation == nil {
		*propagation = []string{}
	}
	policy.normalize()
}

func validatePlatform(platform Platform) error {
	switch platform {
	case PlatformWeb:
		return nil
	case PlatformAndroid, PlatformIOS:
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "platform %q is reserved and not supported yet", platform.StringValue())
	}
	return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "platform must be web, got %q", platform.StringValue())
}

func validateSettings(name string, environment string, origins []string, propagation []string, sampleRate float64, policy PIIPolicy) error {
	if name == "" || len(name) > maxNameLength {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "name must be 1 to %d characters long", maxNameLength)
	}
	if environment == "" || len(environment) > maxEnvironmentLength {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "environment must be 1 to %d characters long", maxEnvironmentLength)
	}
	if sampleRate < 0 || sampleRate > 1 {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "sampleRate must be between 0 and 1, got %v", sampleRate)
	}
	for _, list := range [][]string{origins, propagation, policy.QueryAllowlist, policy.URLAllowlist} {
		if len(list) > maxListLength {
			return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "lists hold at most %d entries", maxListLength)
		}
	}
	for _, origin := range origins {
		if err := validateOrigin(origin); err != nil {
			return err
		}
	}
	for _, prefix := range append(append([]string{}, propagation...), policy.URLAllowlist...) {
		if err := validateURLPrefix(prefix); err != nil {
			return err
		}
	}
	for _, param := range policy.QueryAllowlist {
		if strings.TrimSpace(param) == "" {
			return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "queryAllowlist entries cannot be empty")
		}
	}
	return nil
}

func validateOrigin(origin string) error {
	if origin == anyOrigin {
		return nil
	}

	parsed, err := url.Parse(origin)
	invalid := err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" ||
		(parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil
	if !invalid {
		host := parsed.Hostname()
		invalid = strings.Contains(strings.TrimPrefix(host, "*."), "*")
	}
	if invalid {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "allowed origin %q must be * or scheme://host[:port], with an optional leading *. in the host", origin)
	}
	return nil
}

func validateURLPrefix(prefix string) error {
	parsed, err := url.Parse(prefix)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "url %q must be an absolute http or https URL", prefix)
	}
	return nil
}
