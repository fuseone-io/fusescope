package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewRequestTemplate(t *testing.T) {
	testCases := []struct {
		name     string
		method   string
		url      string
		expected RequestTemplate
	}{
		{name: "NumericSegment", method: "GET", url: "https://shop.example.com/api/products/88213", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/products/:id"}},
		{name: "NumericSegment_NotLast", method: "GET", url: "https://shop.example.com/api/products/90417/reviews", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/products/:id/reviews"}},
		{name: "UUIDSegment", method: "DELETE", url: "http://localhost:3360/api/orders/0d2e71c4-9f3a-4b8e-9d1c-6a2f7b80a4c9", expected: RequestTemplate{Method: "DELETE", Host: "localhost", Path: "/api/orders/:id"}},
		{name: "HashSegment", method: "GET", url: "https://cdn.example.com/blobs/5a77d2c9e8f14b6a9c3d7e0f1b25b3c8/meta", expected: RequestTemplate{Method: "GET", Host: "cdn.example.com", Path: "/blobs/:id/meta"}},
		{name: "ShortHex_Kept", method: "GET", url: "https://shop.example.com/api/facade/cafe", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/facade/cafe"}},
		{name: "MixedWord_Kept", method: "GET", url: "https://shop.example.com/api/v2/search", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/v2/search"}},
		{name: "QueryAndFragment_Dropped", method: "POST", url: "https://shop.example.com/api/cart?id=42#x", expected: RequestTemplate{Method: "POST", Host: "shop.example.com", Path: "/api/cart"}},
		{name: "NoPath_Root", method: "GET", url: "https://shop.example.com", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/"}},
		{name: "NoPathWithQuery_Root", method: "GET", url: "https://shop.example.com?q=1", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/"}},
		{name: "Relative", method: "GET", url: "/api/items/7", expected: RequestTemplate{Method: "GET", Host: "", Path: "/api/items/:id"}},
		{name: "TrailingSlash_Kept", method: "GET", url: "https://shop.example.com/api/items/7/", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/api/items/:id/"}},
		{name: "Port_Dropped", method: "GET", url: "http://localhost:3360/dispatch", expected: RequestTemplate{Method: "GET", Host: "localhost", Path: "/dispatch"}},
		{name: "EncodedSegment_KeptRaw", method: "GET", url: "https://shop.example.com/files/a%2Fb/12", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/files/a%2Fb/:id"}},
		{name: "LowercaseMethod_Uppercased", method: "get", url: "https://shop.example.com/a", expected: RequestTemplate{Method: "GET", Host: "shop.example.com", Path: "/a"}},
		{name: "Empty", method: "", url: "", expected: RequestTemplate{Method: "", Host: "", Path: "/"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, NewRequestTemplate(testCase.method, testCase.url))
		})
	}
}

func TestRequestTemplateString(t *testing.T) {
	testCases := []struct {
		name     string
		template RequestTemplate
		expected string
	}{
		{name: "WithHost", template: RequestTemplate{Method: "GET", Host: "cdn.example.com", Path: "/img/:id"}, expected: "GET cdn.example.com/img/:id"},
		{name: "WithoutHost", template: RequestTemplate{Method: "POST", Path: "/api/cart"}, expected: "POST /api/cart"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.template.String())
		})
	}
}
