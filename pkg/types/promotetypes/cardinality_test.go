package promotetypes

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsCardinalPath(t *testing.T) {
	testCases := []struct {
		name string
		path string
		want bool
	}{
		{name: "HTTPMethod_Normal", path: "http.method"},
		{name: "K8sPodName_Normal", path: "k8s.pod.name"},
		{name: "Underscore_Normal", path: "user_id"},
		{name: "ServiceName_Normal", path: "service.name"},
		{name: "BodyMessage_Normal", path: "body.message"},
		{name: "Hyphen_Normal", path: "attributes.order-id"},
		{name: "HyphenatedSegments_Normal", path: "http-request.user-agent"},
		{name: "CamelCase_Normal", path: "param.driverID"},
		{name: "ShortHex_Normal", path: "trace.deadbeef"},
		{name: "FifteenHexChars_Normal", path: "cache.abcdef012345678"},
		{name: "NineDigits_Normal", path: "order.123456789"},
		{name: "HexAndOtherLetters_Normal", path: "deadbeefdeadbeefx"},
		{name: "Slash_Normal", path: "api/v1/orders"},
		{name: "K8sLabelWithSlash_Normal", path: "k8s.pod.label.app.kubernetes.io/name"},
		{name: "EyJWithoutThreeSegments_Normal", path: "eyJhbGciOiJIUzI1NiJ9.payload"},

		{name: "UUIDSegment_Cardinal", path: "request.550e8400-e29b-41d4-a716-446655440000", want: true},
		{name: "UppercaseUUID_Cardinal", path: "550E8400-E29B-41D4-A716-446655440000", want: true},
		{name: "BracedUUID_Cardinal", path: "session.{550e8400-e29b-41d4-a716-446655440000}", want: true},
		{name: "SixteenHexChars_Cardinal", path: "span.0123456789abcdef", want: true},
		{name: "LongHex_Cardinal", path: "commit.4b825dc642cb6eb9a060e54bf8d69288fbee4904", want: true},
		{name: "TenDigits_Cardinal", path: "user.1234567890", want: true},
		{name: "ThirteenDigitTimestamp_Cardinal", path: "event.1761177600000.name", want: true},
		{name: "JWT_Cardinal", path: "token.eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", want: true},
		{name: "Space_Cardinal", path: "user id", want: true},
		{name: "Tab_Cardinal", path: "user\tid", want: true},
		{name: "URLFragment_Cardinal", path: "https://example.com/orders#items", want: true},
		{name: "Hash_Cardinal", path: "orders#items", want: true},
		{name: "Colon_Cardinal", path: "host:8080", want: true},
		{name: "At_Cardinal", path: "user@example.com", want: true},
		{name: "Emoji_Cardinal", path: "reaction.🔥", want: true},
		{name: "NonASCIILetter_Cardinal", path: "usuário.nome", want: true},

		{name: "Empty_Normal", path: ""},
		{name: "SingleDigit_Normal", path: "7"},
		{name: "Version_Normal", path: "v2"},
		{name: "Year_Normal", path: "2026"},
		{name: "ShortHexLiteral_Normal", path: "0x1f"},
		{name: "EmptySegment_Normal", path: "a..b"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.want, isCardinalPath(testCase.path))
		})
	}
}
