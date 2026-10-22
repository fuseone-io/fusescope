package rumtypes

const (
	AttributeApplicationID         = "fusescope.rum.application.id"
	AttributePlatform              = "fusescope.rum.platform"
	AttributeViewRoute             = "fusescope.rum.view.route"
	AttributeSessionID             = "session.id"
	AttributeEventName             = "event.name"
	AttributeServiceName           = "service.name"
	AttributeDeploymentEnvironment = "deployment.environment.name"
	AttributeDistroName            = "telemetry.distro.name"
	AttributeDistroVersion         = "telemetry.distro.version"
	AttributeSDKName               = "telemetry.sdk.name"
	AttributeSDKVersion            = "telemetry.sdk.version"
)

const (
	SpanNameView         = "view"
	EventNameException   = "exception"
	EventNameWebVital    = "browser.web_vital"
	EventNameLegacyVital = "rum.vital"
)
