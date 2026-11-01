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
	// AttributePackageName is the Android applicationId; upstream semantic
	// conventions name none.
	AttributePackageName = "app.package.name"
	AttributeScreenName  = "app.screen.name"
)

const (
	SpanNameView         = "view"
	EventNameException   = "exception"
	EventNameWebVital    = "browser.web_vital"
	EventNameLegacyVital = "rum.vital"
	// The crash and ANR events of opentelemetry-android, stored as exception.
	EventNameAppCrash  = "app.crash"
	EventNameDeviceANR = "device.anr"
)

// Error sources of Android events, in fusescope.rum.error.source.
const (
	ErrorSourceNative = "native"
	ErrorSourceCrash  = "crash"
	ErrorSourceANR    = "anr"
	// ExceptionTypeLegacyANR is the ANR type SDK 0.1.0-beta.1 sends.
	ExceptionTypeLegacyANR = "ApplicationNotResponding"
	ANRMessage             = "Application Not Responding"
)
