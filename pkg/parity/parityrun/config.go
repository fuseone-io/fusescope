// Package parityrun runs a parity round: it plans the windows, reads the data the gate and the
// sample need, runs the pairs on both graphs, classifies their differences and writes the report.
package parityrun

import (
	"io"
	"slices"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

var ErrCodeTenants = errors.MustNewCode("parity_tenants")

// tenantsVersion is the one version of the tenants file this parity reads.
const tenantsVersion = 1

// Tenant is one organisation the round compares: since when the collector writes it to both
// stores, how long each store keeps it, and the collector instances its spans go through.
type Tenant struct {
	Org                valuer.UUID
	DualWriteEpoch     time.Time
	Retention          parity.Retention
	CollectorInstances []string
}

// Tenants is the tenants file, which D1 maintains and mounts read-only.
type Tenants struct {
	Tenants []Tenant
}

type tenantsFile struct {
	Version int          `yaml:"version"`
	Tenants []tenantFile `yaml:"tenants"`
}

type tenantFile struct {
	Org            string        `yaml:"org"`
	DualWriteEpoch time.Time     `yaml:"dual_write_epoch"`
	Retention      retentionFile `yaml:"retention"`
	Collectors     []string      `yaml:"collector_instances"`
}

type retentionFile struct {
	ClickHouse time.Duration `yaml:"clickhouse"`
	Engine     time.Duration `yaml:"engine"`
}

// ParseTenants reads and checks the whole tenants file; one bad tenant refuses it all.
//
// # Errors
//
// A file of another version, an unknown field, or a tenant without an organisation id, an epoch,
// positive retentions or distinct collector instances, or listed twice.
func ParseTenants(r io.Reader) (Tenants, error) {
	invalid := func(format string, args ...any) (Tenants, error) {
		return Tenants{}, errors.Newf(errors.TypeInvalidInput, ErrCodeTenants, format, args...)
	}
	dec := yaml.NewDecoder(r)
	dec.KnownFields(true)
	var file tenantsFile
	if err := dec.Decode(&file); err != nil {
		return invalid("the tenants file does not decode: %v", err)
	}
	if err := oneDocument(dec); err != nil {
		return Tenants{}, err
	}
	if file.Version != tenantsVersion {
		return invalid("the tenants file is version %d, not %d", file.Version, tenantsVersion)
	}
	if len(file.Tenants) == 0 {
		return invalid("the tenants file lists no tenant")
	}
	out := Tenants{}
	seen := map[string]bool{}
	for i, t := range file.Tenants {
		org, err := valuer.NewUUID(t.Org)
		switch {
		case err != nil:
			return invalid("tenant %d: %q is not an organisation id", i, t.Org)
		case seen[org.StringValue()]:
			return invalid("tenant %d: %s is listed twice", i, org.StringValue())
		case t.DualWriteEpoch.IsZero():
			return invalid("tenant %d: no dual_write_epoch", i)
		case t.Retention.ClickHouse <= 0 || t.Retention.Engine <= 0:
			return invalid("tenant %d: both retentions must be positive", i)
		case len(t.Collectors) == 0 || slices.ContainsFunc(t.Collectors, func(c string) bool { return strings.TrimSpace(c) == "" }) || len(slices.Compact(slices.Sorted(slices.Values(t.Collectors)))) != len(t.Collectors):
			return invalid("tenant %d: collector_instances must name distinct instances", i)
		}
		seen[org.StringValue()] = true
		out.Tenants = append(out.Tenants, Tenant{
			Org:                org,
			DualWriteEpoch:     t.DualWriteEpoch.UTC(),
			Retention:          parity.Retention{ClickHouse: t.Retention.ClickHouse, Engine: t.Retention.Engine},
			CollectorInstances: slices.Clone(t.Collectors),
		})
	}
	return out, nil
}

// oneDocument refuses a second YAML document after the first: a file is one configuration.
func oneDocument(dec *yaml.Decoder) error {
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeTenants, "a configuration file holds one YAML document")
	}
	return nil
}

// Serves tells whether the collector instance writes the spans of org, for parity.Health.
func (t Tenants) Serves(instance, org string) bool {
	for _, tenant := range t.Tenants {
		if tenant.Org.StringValue() == org {
			return slices.Contains(tenant.CollectorInstances, instance)
		}
	}
	return false
}

func (t Tenants) has(org string) bool {
	return slices.ContainsFunc(t.Tenants, func(tenant Tenant) bool { return tenant.Org.StringValue() == org })
}
