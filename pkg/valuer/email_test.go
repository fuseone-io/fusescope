package valuer

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewEmail(t *testing.T) {
	tests := []struct {
		name string
		val  string
		want Email
		pass bool
	}{
		{name: "Valid", val: "test@test.com", want: Email{val: "test@test.com"}, pass: true},
		{name: "ValidWithPlus", val: "test+test@test.com", want: Email{val: "test+test@test.com"}, pass: true},
		{name: "ValidWithMultipleDotsInDomain", val: "test.test@test.com.ok", want: Email{val: "test.test@test.com.ok"}, pass: true},
		{name: "InvalidMissingAt", val: "testtest.com", want: Email{val: ""}, pass: false},
		{name: "InvalidMissingDot", val: "test@testcom", want: Email{val: ""}, pass: false},
		{name: "InvalidMissingLocalPart", val: "@test.com", want: Email{val: ""}, pass: false},
		{name: "InvalidMissingDomain", val: "test@.com", want: Email{val: ""}, pass: false},
		{name: "InvalidMissingLocalPartAndDomain", val: "@.com", want: Email{val: ""}, pass: false},
		{name: "InvalidMissingTldAndDomain", val: "test.c", want: Email{val: ""}, pass: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := NewEmail(test.val)
			if !test.pass {
				assert.Error(t, err)
				return
			}

			assert.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}

func TestEmailScan(t *testing.T) {
	testCases := []struct {
		name string
		val  any
		want Email
		pass bool
	}{
		{name: "String", val: "scan@test.com", want: Email{val: "scan@test.com"}, pass: true},
		{name: "Null", val: nil, pass: false},
		{name: "NonString", val: 42, pass: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var got Email
			err := got.Scan(testCase.val)
			if !testCase.pass {
				assert.Error(t, err)
				return
			}

			assert.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}
