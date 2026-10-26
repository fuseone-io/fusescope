package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseUserAgent(t *testing.T) {
	testCases := []struct {
		name      string
		userAgent string
		expected  Client
	}{
		{name: "ChromeWindows", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", expected: Client{Browser: "Chrome", BrowserVersion: "130", OS: "Windows", OSVersion: "10"}},
		{name: "EdgeWindows", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68", expected: Client{Browser: "Edge", BrowserVersion: "130", OS: "Windows", OSVersion: "10"}},
		{name: "OperaWindows", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0", expected: Client{Browser: "Opera", BrowserVersion: "115", OS: "Windows", OSVersion: "10"}},
		{name: "FirefoxLinux", userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", expected: Client{Browser: "Firefox", BrowserVersion: "131", OS: "Linux"}},
		{name: "SafariIOS", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", expected: Client{Browser: "Safari", BrowserVersion: "18", OS: "iOS", OSVersion: "18"}},
		{name: "SafariIPadOS", userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", expected: Client{Browser: "Safari", BrowserVersion: "17", OS: "iOS", OSVersion: "17"}},
		{name: "SafariMacOS", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", expected: Client{Browser: "Safari", BrowserVersion: "18", OS: "macOS", OSVersion: "10.15"}},
		{name: "ChromeAndroid", userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", expected: Client{Browser: "Chrome", BrowserVersion: "130", OS: "Android", OSVersion: "14"}},
		{name: "SamsungAndroid", userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", expected: Client{Browser: "Samsung Internet", BrowserVersion: "26", OS: "Android", OSVersion: "14"}},
		{name: "ChromeIOS", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1", expected: Client{Browser: "Chrome", BrowserVersion: "130", OS: "iOS", OSVersion: "18"}},
		{name: "FirefoxIOS", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15", expected: Client{Browser: "Firefox", BrowserVersion: "131", OS: "iOS", OSVersion: "18"}},
		{name: "HeadlessChrome", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36", expected: Client{Browser: "Chrome Headless", BrowserVersion: "147", OS: "Linux"}},
		{name: "ChromeOS", userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", expected: Client{Browser: "Chrome", BrowserVersion: "130", OS: "ChromeOS"}},
		{name: "Unknown", userAgent: "curl/8.5.0", expected: Client{}},
		{name: "Empty", userAgent: "", expected: Client{}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, ParseUserAgent(testCase.userAgent))
		})
	}
}

func TestNewClient(t *testing.T) {
	testCases := []struct {
		name       string
		attributes ClientAttributes
		expected   Client
	}{
		{name: "UserAgentWins", attributes: ClientAttributes{UserAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", BrowserBrands: `["Chromium 147"]`, BrowserPlatform: "Windows"}, expected: Client{Browser: "Firefox", BrowserVersion: "131", OS: "Linux"}},
		{name: "BrandsFallback", attributes: ClientAttributes{BrowserBrands: `["Not.A/Brand 8","Chromium 147","Google Chrome 147"]`, BrowserPlatform: "macOS"}, expected: Client{Browser: "Chrome", BrowserVersion: "147", OS: "macOS"}},
		{name: "BrandsFallback_Edge", attributes: ClientAttributes{BrowserBrands: `["Microsoft Edge 130","Chromium 130","Not?A_Brand 99"]`, BrowserPlatform: "Windows"}, expected: Client{Browser: "Edge", BrowserVersion: "130", OS: "Windows"}},
		{name: "BrandsFallback_ChromiumOnly", attributes: ClientAttributes{BrowserBrands: `["Chromium 147","Not.A/Brand 8"]`, BrowserPlatform: "Linux"}, expected: Client{Browser: "Chromium", BrowserVersion: "147", OS: "Linux"}},
		{name: "PlatformOnly", attributes: ClientAttributes{BrowserPlatform: "Android"}, expected: Client{OS: "Android"}},
		{name: "BadBrands", attributes: ClientAttributes{BrowserBrands: `not json`}, expected: Client{}},
		{name: "Nothing", expected: Client{}},
		{name: "AndroidResource_DeviceAndOS", attributes: ClientAttributes{OSName: "Android", OSVersion: "14", DeviceManufacturer: "Google", DeviceModel: "Pixel 8"}, expected: Client{Device: "Google Pixel 8", OS: "Android", OSVersion: "14"}},
		{name: "AndroidResource_MajorVersion", attributes: ClientAttributes{OSName: "Android", OSVersion: "8.1.0", DeviceManufacturer: "samsung", DeviceModel: "SM-G960F"}, expected: Client{Device: "Samsung SM-G960F", OS: "Android", OSVersion: "8"}},
		{name: "AndroidResource_ModelNamesManufacturer", attributes: ClientAttributes{OSName: "Android", OSVersion: "13", DeviceManufacturer: "OnePlus", DeviceModel: "OnePlus 11"}, expected: Client{Device: "OnePlus 11", OS: "Android", OSVersion: "13"}},
		{name: "AndroidResource_ModelOnly", attributes: ClientAttributes{OSName: "Android", DeviceModel: "sdk_gphone64_x86_64"}, expected: Client{Device: "sdk_gphone64_x86_64", OS: "Android"}},
		{name: "UserAgentOverResource", attributes: ClientAttributes{UserAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", OSName: "Android", OSVersion: "14"}, expected: Client{Browser: "Firefox", BrowserVersion: "131", OS: "Linux"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewClient(testCase.attributes))
		})
	}
}
