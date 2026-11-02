package valuer

import (
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUUIDScan(t *testing.T) {
	id := GenerateUUID()

	testCases := []struct {
		name string
		val  any
		want UUID
		pass bool
	}{
		{name: "String", val: id.StringValue(), want: id, pass: true},
		{name: "Bytes", val: id.val[:], want: id, pass: true},
		{name: "Null", val: nil, pass: false},
		{name: "InvalidString", val: "not-a-uuid", pass: false},
		{name: "NonUUIDType", val: 42, pass: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var got UUID
			err := got.Scan(testCase.val)
			if !testCase.pass {
				require.Error(t, err)
				assert.True(t, errors.Asc(err, ErrCodeUnknownValuerScan), err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, testCase.want, got)
		})
	}
}
