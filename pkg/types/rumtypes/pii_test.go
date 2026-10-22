package rumtypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPIIPolicyScrubURL(t *testing.T) {
	testCases := []struct {
		name     string
		policy   PIIPolicy
		input    string
		expected string
	}{
		{name: "NoQueryNoFragment_Unchanged", policy: NewDefaultPIIPolicy(), input: "https://shop.example.com/cart", expected: "https://shop.example.com/cart"},
		{name: "QueryAndFragment_Dropped", policy: NewDefaultPIIPolicy(), input: "https://shop.example.com/customers/392?email=a@b.c#tab", expected: "https://shop.example.com/customers/392"},
		{name: "FragmentBeforeQuery_Dropped", policy: NewDefaultPIIPolicy(), input: "/customers/392#tab?email=a@b.c", expected: "/customers/392"},
		{name: "AllowlistedParam_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}}, input: "/search?q=secret&page=2&token=x", expected: "/search?page=2"},
		{name: "AllowlistedEncodedParam_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"sort by"}}, input: "/list?sort%20by=name&id=7", expected: "/list?sort%20by=name"},
		{name: "AllowlistedParamWithoutValue_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"debug"}}, input: "/x?debug&user=1", expected: "/x?debug"},
		{name: "DropQueryDisabled_QueryKeptFragmentDropped", policy: PIIPolicy{DropQuery: false}, input: "/search?q=shoes#results", expected: "/search?q=shoes"},
		{name: "URLAllowlisted_KeptVerbatim", policy: PIIPolicy{DropQuery: true, URLAllowlist: []string{"https://api.example.com/public/"}}, input: "https://api.example.com/public/items?id=3#top", expected: "https://api.example.com/public/items?id=3#top"},
		{name: "URLAllowlistOtherHost_Scrubbed", policy: PIIPolicy{DropQuery: true, URLAllowlist: []string{"https://api.example.com/public/"}}, input: "https://evil.example.com/public/items?id=3", expected: "https://evil.example.com/public/items"},
		{name: "EmptyQuery_Removed", policy: NewDefaultPIIPolicy(), input: "/cart?", expected: "/cart"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.policy.ScrubURL(testCase.input))
		})
	}
}

func TestPIIPolicyScrubQuery(t *testing.T) {
	testCases := []struct {
		name     string
		policy   PIIPolicy
		input    string
		expected string
	}{
		{name: "Default_AllDropped", policy: NewDefaultPIIPolicy(), input: "email=a@b.c&page=1", expected: ""},
		{name: "Allowlisted_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}}, input: "email=a@b.c&page=1", expected: "page=1"},
		{name: "LeadingQuestionMark_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}}, input: "?page=1&x=2", expected: "page=1"},
		{name: "DropQueryDisabled_Unchanged", policy: PIIPolicy{DropQuery: false}, input: "email=a@b.c", expected: "email=a@b.c"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.policy.ScrubQuery(testCase.input))
		})
	}
}

func TestPIIPolicyScrubSpanName(t *testing.T) {
	testCases := []struct {
		name     string
		policy   PIIPolicy
		input    string
		expected string
	}{
		{name: "PlainName_Unchanged", policy: NewDefaultPIIPolicy(), input: "documentLoad", expected: "documentLoad"},
		{name: "NavigationWithFragmentAndQuery_Scrubbed", policy: NewDefaultPIIPolicy(), input: "Navigation: /customers/392#tab?email=a@b.c", expected: "Navigation: /customers/392"},
		{name: "HTTPMethodAndURL_Scrubbed", policy: NewDefaultPIIPolicy(), input: "GET https://api.example.com/users?token=abc", expected: "GET https://api.example.com/users"},
		{name: "AllowlistedParamInName_Kept", policy: PIIPolicy{DropQuery: true, QueryAllowlist: []string{"page"}}, input: "GET /items?page=3&session=x", expected: "GET /items?page=3"},
		{name: "SpacesPreserved", policy: NewDefaultPIIPolicy(), input: "click  on /a?b=c", expected: "click  on /a"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.expected, testCase.policy.ScrubSpanName(testCase.input))
		})
	}
}
