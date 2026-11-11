package parityrun

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"regexp"

	"gopkg.in/yaml.v3"

	"github.com/fuseone-io/fusescope/pkg/config"
	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeCredentials = errors.MustNewCode("parity_credentials")

// maxDSNBytes caps the ClickHouse DSN file.
const maxDSNBytes = 8 << 10

// namespaceName is a Kubernetes namespace: a DNS label.
var namespaceName = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$`)

// CredentialsSettings name the files the parity's credentials are read from, in place of inline
// values in the settings file.
type CredentialsSettings struct {
	// ClickHouseDSNFile holds the ClickHouse DSN, user and password included; it excludes an inline
	// clickhouse.clickhouse.dsn.
	ClickHouseDSNFile string `mapstructure:"clickhouse_dsn_file"`
}

// LoadCredentials reads the credential files s names into s. Settings with an inline DSN read
// nothing. The files' content never appears in an error.
//
// # Errors
//
// A DSN file that does not open, is not a regular file, is empty, or exceeds maxDSNBytes.
func (s Settings) LoadCredentials() (Settings, error) {
	path := s.Credentials.ClickHouseDSNFile
	if path == "" {
		return s, nil
	}
	// Checked before opening: opening a FIFO for reading blocks.
	if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeCredentials, "the ClickHouse DSN file %s is not a readable file", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeCredentials, "the ClickHouse DSN file %s does not open", path)
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, maxDSNBytes+1))
	if err != nil {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeCredentials, "the ClickHouse DSN file %s does not read", path)
	}
	if len(raw) > maxDSNBytes {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeCredentials, "the ClickHouse DSN file %s exceeds %d bytes", path, maxDSNBytes)
	}
	dsn := bytes.TrimSpace(raw)
	if len(dsn) == 0 {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeCredentials, "the ClickHouse DSN file %s is empty", path)
	}
	s.ClickHouse.Clickhouse.DSN = string(dsn)
	return s, nil
}

// inlineDSN tells whether the settings document itself sets clickhouse.clickhouse.dsn: the
// backend's defaults hold one, so the decoded settings cannot tell.
func inlineDSN(raw map[string]any) bool {
	clickhouse, _ := raw["clickhouse"].(map[string]any)
	inner, _ := clickhouse["clickhouse"].(map[string]any)
	dsn, _ := inner["dsn"].(string)
	return dsn != ""
}

// dsnSource checks that the ClickHouse DSN has exactly one source, a file an absolute path, and
// clears the default DSN when the file is the source, so nothing but the file can supply it.
func (s Settings) dsnSource(inline bool) (Settings, error) {
	file := s.Credentials.ClickHouseDSNFile
	if inline == (file != "") {
		return s, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, "the ClickHouse DSN comes from exactly one of clickhouse.clickhouse.dsn and credentials.clickhouse_dsn_file")
	}
	if file != "" {
		if !filepath.IsAbs(file) {
			return s, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, "credentials.clickhouse_dsn_file must be an absolute path")
		}
		s.ClickHouse.Clickhouse.DSN = ""
	}
	return s, nil
}

// ParseCleanupSettings reads the cleanup's part of the settings file: one document, its version,
// and the secret section over its defaults. No other section is read, so the cleanup needs none of
// the round's credentials.
//
// # Errors
//
// Another document or version, or a secret section without a namespace, with relative token or CA
// paths, or without a positive expiry.
func ParseCleanupSettings(r io.Reader) (SecretSettings, error) {
	invalid := func(format string, args ...any) (SecretSettings, error) {
		return SecretSettings{}, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, format, args...)
	}
	raw, err := decodeSettingsDocument(r)
	if err != nil {
		return SecretSettings{}, err
	}
	secret := defaultSecretSettings()
	if section, ok := raw["secret"]; ok {
		conf, err := config.NewConfFromMap(map[string]any{"secret": section})
		if err != nil {
			return invalid("the secret settings do not load: %v", err)
		}
		if err := conf.Unmarshal("secret", &secret); err != nil {
			return invalid("the secret settings do not decode: %v", err)
		}
	}
	switch {
	case !namespaceName.MatchString(secret.Namespace):
		return invalid("secret.namespace must be a namespace name")
	case !filepath.IsAbs(secret.TokenFile) || !filepath.IsAbs(secret.CAFile):
		return invalid("secret.token_file and secret.ca_file must be absolute paths")
	case secret.Expiry <= 0:
		return invalid("secret.expiry must be positive")
	}
	return secret, nil
}

// decodeSettingsDocument decodes the one YAML document of a settings file of settingsVersion.
func decodeSettingsDocument(r io.Reader) (map[string]any, error) {
	invalid := func(format string, args ...any) (map[string]any, error) {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeSettings, format, args...)
	}
	var raw map[string]any
	dec := yaml.NewDecoder(r)
	if err := dec.Decode(&raw); err != nil {
		return invalid("the settings file does not decode: %v", err)
	}
	if err := oneDocument(dec, ErrCodeSettings); err != nil {
		return nil, err
	}
	if v, _ := raw["version"].(int); v != settingsVersion {
		return invalid("the settings file is not version %d", settingsVersion)
	}
	return raw, nil
}
