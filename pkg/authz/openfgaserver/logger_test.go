package openfgaserver

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap/zapcore" //nolint:depguard
)

type levelHandler struct {
	slog.Handler
	level slog.Level
}

func (handler levelHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= handler.level
}

func TestLoggerLevel(t *testing.T) {
	testCases := []struct {
		name  string
		level slog.Level
		want  zapcore.Level
	}{
		{name: "Debug", level: slog.LevelDebug, want: zapcore.DebugLevel},
		{name: "Info", level: slog.LevelInfo, want: zapcore.InfoLevel},
		{name: "Warn", level: slog.LevelWarn, want: zapcore.WarnLevel},
		{name: "Error", level: slog.LevelError, want: zapcore.ErrorLevel},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			logger := NewLogger(slog.New(levelHandler{Handler: slog.DiscardHandler, level: testCase.level}))
			assert.Equal(t, testCase.want, logger.Level())
		})
	}
}
