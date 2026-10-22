package client

import (
	"context"
	"log/slog"
	"net/mail"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRejectsHeaderNamesWithLineBreaks(t *testing.T) {
	testCases := []struct {
		name    string
		headers map[string]string
	}{
		{name: "CarriageReturnLineFeed", headers: map[string]string{"X-Team\r\nBcc: victim@example.com": "ops"}},
		{name: "LineFeed", headers: map[string]string{"X-Env\nBcc: other@example.com": "prod"}},
		{name: "Colon", headers: map[string]string{"X-Tag: injected": "value"}},
		{name: "Empty", headers: map[string]string{"": "empty"}},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := New("127.0.0.1:1", slog.New(slog.DiscardHandler), WithHeaders(testCase.headers))

			require.Error(t, err)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
		})
	}
}

func TestDoRejectsSubjectsWithLineBreaks(t *testing.T) {
	smtpClient, err := New("127.0.0.1:1", slog.New(slog.DiscardHandler))
	require.NoError(t, err)

	to := []*mail.Address{{Address: "user@example.com"}}

	testCases := []struct {
		name    string
		subject string
	}{
		{name: "CarriageReturnLineFeed", subject: "Hello\r\nBcc: victim@example.com"},
		{name: "LineFeed", subject: "Reset\nBcc: other@example.com"},
		{name: "CarriageReturn", subject: "Invite\rX-Injected: yes"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := smtpClient.Do(context.Background(), to, testCase.subject, ContentTypeHTML, []byte("<p>body</p>"))

			require.Error(t, err)
			assert.True(t, errors.Ast(err, errors.TypeInvalidInput))
		})
	}
}
