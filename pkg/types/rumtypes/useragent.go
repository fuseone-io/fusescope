package rumtypes

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Order matters: Chromium-based browsers also send Chrome/ and Safari/, and
// Chrome also sends Safari/.
var browserTokens = []struct {
	name    string
	pattern *regexp.Regexp
}{
	{name: "Edge", pattern: regexp.MustCompile(`\bEdg(?:e|A|iOS)?/([0-9]+)`)},
	{name: "Opera", pattern: regexp.MustCompile(`\bOPR/([0-9]+)`)},
	{name: "Samsung Internet", pattern: regexp.MustCompile(`\bSamsungBrowser/([0-9]+)`)},
	{name: "Chrome Headless", pattern: regexp.MustCompile(`\bHeadlessChrome/([0-9]+)`)},
	{name: "Chrome", pattern: regexp.MustCompile(`\b(?:Chrome|CriOS)/([0-9]+)`)},
	{name: "Firefox", pattern: regexp.MustCompile(`\b(?:Firefox|FxiOS)/([0-9]+)`)},
	{name: "Safari", pattern: regexp.MustCompile(`\bVersion/([0-9]+)[0-9.]* (?:Mobile/\S+ )?Safari/`)},
}

var (
	osIOS     = regexp.MustCompile(`\((?:iPhone|iPad|iPod)[^)]*? OS ([0-9]+)`)
	osAndroid = regexp.MustCompile(`\bAndroid ([0-9]+)`)
	osWindows = regexp.MustCompile(`\bWindows NT ([0-9]+)`)
	osMacOS   = regexp.MustCompile(`\bMac OS X ([0-9]+)[_.]([0-9]+)`)
)

// Brands in the order a specific browser is preferred over its engine.
var clientHintBrands = []struct{ brand, name string }{
	{brand: "Microsoft Edge", name: "Edge"},
	{brand: "Opera", name: "Opera"},
	{brand: "Google Chrome", name: "Chrome"},
	{brand: "HeadlessChrome", name: "Chrome Headless"},
	{brand: "Chromium", name: "Chromium"},
}

type Client struct {
	Browser        string `json:"browser" required:"true" description:"Empty when unknown."`
	BrowserVersion string `json:"browserVersion" required:"true" description:"Major version."`
	Device         string `json:"device" required:"true" description:"Manufacturer and model of a mobile device, from device.manufacturer and device.model.name, e.g. Google Pixel 8; empty in a browser."`
	OS             string `json:"os" required:"true" description:"Empty when unknown."`
	OSVersion      string `json:"osVersion" required:"true" description:"Major version, major.minor for macOS, empty when the user agent hides it."`
}

// ClientAttributes are the resource attributes a client is read from: the
// browser's user agent and client hints, or the os.* and device.* a mobile
// SDK sends.
type ClientAttributes struct {
	UserAgent          string
	BrowserBrands      string
	BrowserPlatform    string
	OSName             string
	OSVersion          string
	DeviceManufacturer string
	DeviceModel        string
}

// NewClient reads the user agent and falls back to the browser.brands and
// browser.platform client hints the SDK records. Without a user agent, a
// mobile resource's os.name and device.* name the client.
func NewClient(attributes ClientAttributes) Client {
	if attributes.UserAgent == "" && attributes.OSName != "" {
		version, _, _ := strings.Cut(attributes.OSVersion, ".")
		return Client{Device: deviceLabel(attributes.DeviceManufacturer, attributes.DeviceModel), OS: attributes.OSName, OSVersion: version}
	}

	client := ParseUserAgent(attributes.UserAgent)
	if client.Browser == "" {
		client.Browser, client.BrowserVersion = browserFromBrands(attributes.BrowserBrands)
	}
	if client.OS == "" {
		client.OS = attributes.BrowserPlatform
	}
	return client
}

func ParseUserAgent(userAgent string) Client {
	client := Client{}
	for _, token := range browserTokens {
		if match := token.pattern.FindStringSubmatch(userAgent); match != nil {
			client.Browser, client.BrowserVersion = token.name, match[1]
			break
		}
	}

	switch {
	case osIOS.MatchString(userAgent):
		client.OS, client.OSVersion = "iOS", osIOS.FindStringSubmatch(userAgent)[1]
	case osAndroid.MatchString(userAgent):
		client.OS, client.OSVersion = "Android", osAndroid.FindStringSubmatch(userAgent)[1]
	case osWindows.MatchString(userAgent):
		client.OS, client.OSVersion = "Windows", osWindows.FindStringSubmatch(userAgent)[1]
	case osMacOS.MatchString(userAgent):
		match := osMacOS.FindStringSubmatch(userAgent)
		client.OS, client.OSVersion = "macOS", match[1]+"."+match[2]
	case strings.Contains(userAgent, "CrOS"):
		client.OS = "ChromeOS"
	case strings.Contains(userAgent, "Linux"):
		client.OS = "Linux"
	}
	return client
}

func browserFromBrands(brands string) (string, string) {
	if brands == "" {
		return "", ""
	}
	list := []string{}
	if err := json.Unmarshal([]byte(brands), &list); err != nil {
		return "", ""
	}

	for _, known := range clientHintBrands {
		for _, entry := range list {
			if version, ok := strings.CutPrefix(entry, known.brand+" "); ok {
				return known.name, version
			}
		}
	}
	return "", ""
}

// deviceLabel prefixes the model with its manufacturer, capitalized, unless
// the model already names it.
func deviceLabel(manufacturer string, model string) string {
	manufacturer, model = strings.TrimSpace(manufacturer), strings.TrimSpace(model)
	if manufacturer == "" || strings.HasPrefix(strings.ToLower(model), strings.ToLower(manufacturer)) {
		return model
	}
	label := strings.ToUpper(manufacturer[:1]) + manufacturer[1:]
	if model == "" {
		return label
	}
	return label + " " + model
}
