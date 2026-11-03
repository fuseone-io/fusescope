package instrumentation

import (
	"sort"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"go.opentelemetry.io/contrib/otelconf"
)

const (
	protocolGRPC         = "grpc"
	protocolHTTPProtobuf = "http/protobuf"
)

func (c TracesConfig) tracerProvider() (*otelconf.TracerProvider, error) {
	provider := &otelconf.TracerProvider{Sampler: c.Sampler.otelconf()}

	if c.Processors.Batch.Exporter.configured() {
		exporter, err := c.Processors.Batch.Exporter.otelconf()
		if err != nil {
			return nil, err
		}
		batch := c.Processors.Batch
		provider.Processors = []otelconf.SpanProcessor{{Batch: &otelconf.BatchSpanProcessor{
			ExportTimeout:      batch.ExportTimeout,
			Exporter:           exporter,
			MaxExportBatchSize: batch.MaxExportBatchSize,
			MaxQueueSize:       batch.MaxQueueSize,
			ScheduleDelay:      batch.ScheduleDelay,
		}}}
	}

	return provider, nil
}

func (e SpanExporter) configured() bool {
	return e.OTLP != nil || e.Console != nil
}

func (e SpanExporter) otelconf() (otelconf.SpanExporter, error) {
	if e.OTLP == nil {
		return otelconf.SpanExporter{Console: otelconf.ConsoleExporter(e.Console)}, nil
	}

	otlp := e.OTLP
	headers := nameValuePairs(otlp.Headers)
	switch otlp.Protocol {
	case "", protocolGRPC:
		exporter := &otelconf.OTLPGrpcExporter{
			Endpoint:    &otlp.Endpoint,
			Headers:     headers,
			Compression: otlp.Compression,
			Timeout:     otlp.Timeout,
		}
		if otlp.Insecure != nil || otlp.Certificate != nil || otlp.ClientCertificate != nil || otlp.ClientKey != nil {
			exporter.Tls = &otelconf.GrpcTls{Insecure: otlp.Insecure, CaFile: otlp.Certificate, CertFile: otlp.ClientCertificate, KeyFile: otlp.ClientKey}
		}
		return otelconf.SpanExporter{OTLPGrpc: exporter}, nil
	case protocolHTTPProtobuf:
		exporter := &otelconf.OTLPHttpExporter{
			Endpoint:    &otlp.Endpoint,
			Headers:     headers,
			Compression: otlp.Compression,
			Timeout:     otlp.Timeout,
		}
		if otlp.Certificate != nil || otlp.ClientCertificate != nil || otlp.ClientKey != nil {
			exporter.Tls = &otelconf.HttpTls{CaFile: otlp.Certificate, CertFile: otlp.ClientCertificate, KeyFile: otlp.ClientKey}
		}
		return otelconf.SpanExporter{OTLPHttp: exporter}, nil
	default:
		return otelconf.SpanExporter{}, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "unsupported OTLP protocol %q, use %q or %q", otlp.Protocol, protocolGRPC, protocolHTTPProtobuf)
	}
}

func (s *Sampler) otelconf() *otelconf.Sampler {
	if s == nil || (s.AlwaysOff == nil && s.AlwaysOn == nil && s.ParentBased == nil && s.TraceIDRatioBased == nil) {
		return nil
	}

	sampler := &otelconf.Sampler{
		AlwaysOff: otelconf.AlwaysOffSampler(s.AlwaysOff),
		AlwaysOn:  otelconf.AlwaysOnSampler(s.AlwaysOn),
	}
	if s.TraceIDRatioBased != nil {
		sampler.TraceIDRatioBased = &otelconf.TraceIDRatioBasedSampler{Ratio: s.TraceIDRatioBased.Ratio}
	}
	if parent := s.ParentBased; parent != nil {
		sampler.ParentBased = &otelconf.ParentBasedSampler{
			Root:                   parent.Root.otelconf(),
			RemoteParentSampled:    parent.RemoteParentSampled.otelconf(),
			RemoteParentNotSampled: parent.RemoteParentNotSampled.otelconf(),
			LocalParentSampled:     parent.LocalParentSampled.otelconf(),
			LocalParentNotSampled:  parent.LocalParentNotSampled.otelconf(),
		}
	}

	return sampler
}

func nameValuePairs(values map[string]string) []otelconf.NameStringValuePair {
	if len(values) == 0 {
		return nil
	}

	pairs := make([]otelconf.NameStringValuePair, 0, len(values))
	for name, value := range values {
		pairs = append(pairs, otelconf.NameStringValuePair{Name: name, Value: &value})
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].Name < pairs[j].Name })

	return pairs
}

func resourceAttributes(attributes map[string]any) []otelconf.AttributeNameValue {
	values := make([]otelconf.AttributeNameValue, 0, len(attributes))
	for name, value := range attributes {
		values = append(values, otelconf.AttributeNameValue{Name: name, Value: value})
	}
	sort.Slice(values, func(i, j int) bool { return values[i].Name < values[j].Name })

	return values
}
