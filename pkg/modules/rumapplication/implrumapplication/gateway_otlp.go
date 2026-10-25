package implrumapplication

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/http/render"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"go.opentelemetry.io/collector/pdata/pcommon"
	"go.opentelemetry.io/collector/pdata/plog/plogotlp"
	"go.opentelemetry.io/collector/pdata/ptrace/ptraceotlp"
)

const collectorRetryAfter = 5 * time.Second

var (
	encodingProtobuf = otlpEncoding{json: false}
	encodingJSON     = otlpEncoding{json: true}
)

var tracesSignal = otlpSignal{
	path: "/v1/traces",
	process: func(application *rumtypes.Application, body []byte, encoding otlpEncoding) ([]byte, *rumtypes.IngestBatch, *rejection) {
		request := ptraceotlp.NewExportRequest()
		if err := encoding.unmarshal(body, request.UnmarshalJSON, request.UnmarshalProto); err != nil {
			return nil, nil, &rejection{err: err, reason: rumtypes.RejectionReasonInvalidPayload}
		}
		resources := make([]pcommon.Resource, 0, request.Traces().ResourceSpans().Len())
		for i := 0; i < request.Traces().ResourceSpans().Len(); i++ {
			resources = append(resources, request.Traces().ResourceSpans().At(i).Resource())
		}
		if refused := refusePackageNames(application, resources); refused != nil {
			return nil, nil, refused
		}
		batch := processTraces(application, request.Traces())
		return marshalProcessed(request.MarshalProto, batch)
	},
	response: func(encoding otlpEncoding) ([]byte, error) {
		response := ptraceotlp.NewExportResponse()
		if encoding.json {
			return response.MarshalJSON()
		}
		return response.MarshalProto()
	},
}

var logsSignal = otlpSignal{
	path: "/v1/logs",
	process: func(application *rumtypes.Application, body []byte, encoding otlpEncoding) ([]byte, *rumtypes.IngestBatch, *rejection) {
		request := plogotlp.NewExportRequest()
		if err := encoding.unmarshal(body, request.UnmarshalJSON, request.UnmarshalProto); err != nil {
			return nil, nil, &rejection{err: err, reason: rumtypes.RejectionReasonInvalidPayload}
		}
		resources := make([]pcommon.Resource, 0, request.Logs().ResourceLogs().Len())
		for i := 0; i < request.Logs().ResourceLogs().Len(); i++ {
			resources = append(resources, request.Logs().ResourceLogs().At(i).Resource())
		}
		if refused := refusePackageNames(application, resources); refused != nil {
			return nil, nil, refused
		}
		batch := processLogs(application, request.Logs())
		return marshalProcessed(request.MarshalProto, batch)
	},
	response: func(encoding otlpEncoding) ([]byte, error) {
		response := plogotlp.NewExportResponse()
		if encoding.json {
			return response.MarshalJSON()
		}
		return response.MarshalProto()
	},
}

type otlpEncoding struct {
	json bool
}

// otlpSignal decodes a request, processes it and re-encodes it as protobuf
// for the collector.
type otlpSignal struct {
	path     string
	process  func(*rumtypes.Application, []byte, otlpEncoding) ([]byte, *rumtypes.IngestBatch, *rejection)
	response func(otlpEncoding) ([]byte, error)
}

// collectorError keeps the status to answer when the collector refuses or
// cannot be reached, so clients retry only what OTLP says is retryable.
type collectorError struct {
	status int
	err    error
}

func (err *collectorError) Error() string {
	return err.err.Error()
}

func (err *collectorError) Unwrap() error {
	return err.err
}

func refusePackageNames(application *rumtypes.Application, resources []pcommon.Resource) *rejection {
	packageName, ok := allowedPackageNames(application, resources)
	if ok {
		return nil
	}
	err := errors.NewForbiddenf(ErrCodePackageNotAllowed, "app.package.name %q is not allowed for this application", packageName)
	return &rejection{err: err, reason: rumtypes.RejectionReasonPackageNotAllowed, observed: packageName}
}

func marshalProcessed(marshal func() ([]byte, error), batch *rumtypes.IngestBatch) ([]byte, *rumtypes.IngestBatch, *rejection) {
	payload, err := marshal()
	if err != nil {
		return nil, nil, &rejection{err: err}
	}
	return payload, batch, nil
}

// encodingOf maps the Content-Type to an encoding. text/plain is read as JSON
// because navigator.sendBeacon can only send CORS-safelisted types.
func encodingOf(contentType string) (otlpEncoding, error) {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(contentType))
	}

	switch mediaType {
	case "application/x-protobuf", "application/protobuf":
		return encodingProtobuf, nil
	case "application/json", "text/plain":
		return encodingJSON, nil
	}
	return encodingProtobuf, errors.NewInvalidInputf(ErrCodePayloadInvalid, "unsupported content type %q, use application/json or application/x-protobuf", contentType)
}

func (encoding otlpEncoding) contentType() string {
	if encoding.json {
		return "application/json"
	}
	return "application/x-protobuf"
}

func (encoding otlpEncoding) unmarshal(body []byte, fromJSON func([]byte) error, fromProto func([]byte) error) error {
	decode := fromProto
	if encoding.json {
		decode = fromJSON
	}
	if err := decode(body); err != nil {
		return errors.WrapInvalidInputf(err, ErrCodePayloadInvalid, "invalid otlp payload")
	}
	return nil
}

// readBody caps the body before and after gzip decoding.
func readBody(req *http.Request, limit int64) ([]byte, error) {
	if req.ContentLength > limit {
		return nil, errors.Newf(errors.TypePayloadTooLarge, ErrCodePayloadTooLarge, "request body is larger than %d bytes", limit)
	}

	reader := io.Reader(req.Body)
	switch strings.ToLower(strings.TrimSpace(req.Header.Get("Content-Encoding"))) {
	case "", "identity":
	case "gzip":
		compressed, err := readLimited(reader, limit)
		if err != nil {
			return nil, err
		}
		gzipReader, err := gzip.NewReader(bytes.NewReader(compressed))
		if err != nil {
			return nil, errors.WrapInvalidInputf(err, ErrCodePayloadInvalid, "invalid gzip body")
		}
		defer func() { _ = gzipReader.Close() }()
		reader = gzipReader
	default:
		return nil, errors.NewInvalidInputf(ErrCodePayloadInvalid, "unsupported content encoding %q", req.Header.Get("Content-Encoding"))
	}

	return readLimited(reader, limit)
}

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, errors.WrapInvalidInputf(err, ErrCodePayloadInvalid, "failed to read request body")
	}
	if int64(len(body)) > limit {
		return nil, errors.Newf(errors.TypePayloadTooLarge, ErrCodePayloadTooLarge, "request body is larger than %d bytes", limit)
	}
	return body, nil
}

func (gateway *gateway) forward(ctx context.Context, path string, payload []byte) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(gateway.config.CollectorEndpoint, "/")+path, bytes.NewReader(payload))
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeCollector, "failed to build the collector request")
	}
	request.Header.Set("Content-Type", encodingProtobuf.contentType())

	response, err := gateway.client.Do(request)
	if err != nil {
		gateway.settings.Logger().WarnContext(ctx, "rum collector unreachable", errors.Attr(err))
		return &collectorError{status: http.StatusServiceUnavailable, err: errors.WrapInternalf(err, ErrCodeCollector, "collector unreachable")}
	}
	defer func() { _ = response.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))

	switch {
	case response.StatusCode < 300:
		return nil
	case response.StatusCode == http.StatusTooManyRequests, response.StatusCode == http.StatusServiceUnavailable:
		return &collectorError{status: response.StatusCode, err: errors.NewInternalf(ErrCodeCollector, "collector is busy")}
	case response.StatusCode < 500:
		return errors.NewInvalidInputf(ErrCodePayloadInvalid, "collector refused the payload with status %d", response.StatusCode)
	}
	return &collectorError{status: http.StatusBadGateway, err: errors.NewInternalf(ErrCodeCollector, "collector failed with status %d", response.StatusCode)}
}

func writeError(rw http.ResponseWriter, err error) {
	var upstream *collectorError
	if !errors.As(err, &upstream) {
		render.Error(rw, err)
		return
	}

	body, marshalErr := json.Marshal(&render.ErrorResponse{Status: "error", Error: errors.AsJSON(upstream.err)})
	if marshalErr != nil {
		render.Error(rw, marshalErr)
		return
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.Header().Set("Retry-After", strconv.Itoa(int(collectorRetryAfter.Seconds())))
	rw.WriteHeader(upstream.status)
	_, _ = rw.Write(body)
}
