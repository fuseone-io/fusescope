package parityrun

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeBucket = errors.MustNewCode("parity_bucket")

const (
	// queueKey is the one object the requeue is, under its own prefix and KMS key.
	queueKey = "requeue/queue.json"
	// queueFormat is the version of the queue's envelope this parity reads and writes.
	queueFormat = 1
	// uploadTimeout bounds a report's upload, which runs once the round is done.
	uploadTimeout = 2 * time.Minute
)

// NewBucketClient is the one client the report, the requeue and the investigation's read go
// through, addressing the bucket as its settings say; the endpoint is never inspected to decide it.
func NewBucketClient(cfg aws.Config, settings BucketSettings) *s3.Client {
	return s3.NewFromConfig(cfg, func(o *s3.Options) { o.UsePathStyle = settings.PathStyle })
}

// S3Config names the staging bucket, the KMS key the requeue is written under, and the bounds of
// the queue, checked on load before decoding and on replace before writing.
type S3Config struct {
	Bucket        string
	KMSKeyID      string
	MaxQueueBytes int64
	MaxQueueSpecs int
}

// Validate checks the bucket configuration, before anything is written.
//
// # Errors
//
// A missing bucket or KMS key, or bounds that are not positive.
func (c S3Config) Validate() error {
	if c.Bucket == "" || c.KMSKeyID == "" || c.MaxQueueBytes <= 0 || c.MaxQueueSpecs <= 0 {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeBucket, "the bucket needs a name, the requeue's KMS key and positive queue bounds")
	}
	return nil
}

// statusOf is the HTTP status of a failed S3 call, 0 when no answer came.
func statusOf(err error) int {
	var re *awshttp.ResponseError
	if errors.As(err, &re) {
		return re.HTTPStatusCode()
	}
	return 0
}

// runIDDate is the UTC start date a run id opens with.
var runIDDate = regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})t\d{6}z-\d+$`)

// ReportKey is where the report of runID lives: under the UTC day the round started.
//
// # Errors
//
// A run id that is not one.
func ReportKey(runID string) (string, error) {
	m := runIDDate.FindStringSubmatch(runID)
	if m == nil {
		return "", errors.Newf(errors.TypeInvalidInput, ErrCodeBucket, "not a run id")
	}
	return "reports/" + m[1] + "/" + m[2] + "/" + m[3] + "/" + runID + ".jsonl", nil
}

// S3Sink publishes a round's report to ReportKey, once: it is built in Local, then uploaded with
// If-None-Match and its SHA-256, and published only once the bucket took it.
type S3Sink struct {
	Client *s3.Client
	Config S3Config
	Local  FileSink
}

// Create starts the report of runID locally.
//
// # Errors
//
// An invalid bucket configuration, or a local file that cannot be created.
func (s S3Sink) Create(runID string) (ReportWriter, error) {
	if err := s.Config.Validate(); err != nil {
		return nil, err
	}
	key, err := ReportKey(runID)
	if err != nil {
		return nil, err
	}
	local, err := s.Local.Create(runID)
	if err != nil {
		return nil, err
	}
	return &s3Writer{ReportWriter: local, sink: s, file: filepath.Join(s.Local.Dir, runID+".jsonl"), key: key}, nil
}

type s3Writer struct {
	ReportWriter
	sink S3Sink
	file string
	key  string
}

func (w *s3Writer) Publish(ctx context.Context, summary Summary) error {
	if err := w.ReportWriter.Publish(ctx, summary); err != nil {
		return err
	}
	body, err := os.ReadFile(w.file)
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeBucket, "error reading the report to upload")
	}
	sum := sha256.Sum256(body)
	ctx, cancel := context.WithTimeout(ctx, uploadTimeout)
	defer cancel()
	_, err = w.sink.Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(w.sink.Config.Bucket), Key: aws.String(w.key), Body: bytes.NewReader(body),
		IfNoneMatch: aws.String("*"), ChecksumSHA256: aws.String(base64.StdEncoding.EncodeToString(sum[:])),
		ContentType: aws.String("application/x-ndjson"),
	})
	if err != nil {
		return errors.Newf(errors.TypeInternal, ErrCodeBucket, "the bucket did not take the report: %d", statusOf(err))
	}
	return nil
}

// S3Requeue is the requeue as one object of the bucket, under its own KMS key, replaced only at the
// ETag it was loaded at: the ETag is an opaque version.
type S3Requeue struct {
	Client *s3.Client
	Config S3Config
}

type queueEnvelope struct {
	Format int        `json:"format"`
	Specs  []PairSpec `json:"specs"`
}

// Load returns the queue and its ETag; only a missing object is an empty queue.
//
// # Errors
//
// An invalid configuration, any other failure, an object over the byte bound, an envelope that
// does not decode or of another format, or more specs than the bound.
func (q S3Requeue) Load(ctx context.Context) ([]PairSpec, string, error) {
	if err := q.Config.Validate(); err != nil {
		return nil, "", err
	}
	out, err := q.Client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(q.Config.Bucket), Key: aws.String(queueKey)})
	if err != nil {
		if statusOf(err) == http.StatusNotFound {
			return nil, "", nil
		}
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue does not load: %d", statusOf(err))
	}
	defer out.Body.Close()
	if out.ContentLength != nil && *out.ContentLength > q.Config.MaxQueueBytes {
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue is over its byte bound")
	}
	raw, err := io.ReadAll(io.LimitReader(out.Body, q.Config.MaxQueueBytes+1))
	if err != nil || int64(len(raw)) > q.Config.MaxQueueBytes {
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue is over its byte bound or does not read")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var envelope queueEnvelope
	if err := dec.Decode(&envelope); err != nil || envelope.Format != queueFormat {
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue is not a queue of format %d", queueFormat)
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue holds more than one document")
	}
	if len(envelope.Specs) > q.Config.MaxQueueSpecs {
		return nil, "", errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue holds more specs than its bound")
	}
	return envelope.Specs, aws.ToString(out.ETag), nil
}

// Replace makes specs the queue if it is still at version, under the requeue's KMS key.
//
// # Errors
//
// An invalid configuration, more specs or bytes than the bounds, a queue changed since version
// (412), or any other failure.
func (q S3Requeue) Replace(ctx context.Context, version string, specs []PairSpec) error {
	if err := q.Config.Validate(); err != nil {
		return err
	}
	if len(specs) > q.Config.MaxQueueSpecs {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeBucket, "the requeue would hold more specs than its bound")
	}
	body, err := json.Marshal(queueEnvelope{Format: queueFormat, Specs: specs})
	if err != nil || int64(len(body)) > q.Config.MaxQueueBytes {
		return errors.Newf(errors.TypeInvalidInput, ErrCodeBucket, "the requeue would be over its byte bound")
	}
	in := &s3.PutObjectInput{
		Bucket: aws.String(q.Config.Bucket), Key: aws.String(queueKey), Body: bytes.NewReader(body),
		ServerSideEncryption: types.ServerSideEncryptionAwsKms, SSEKMSKeyId: aws.String(q.Config.KMSKeyID),
		ContentType: aws.String("application/json"),
	}
	if version == "" {
		in.IfNoneMatch = aws.String("*")
	} else {
		in.IfMatch = aws.String(version)
	}
	if _, err := q.Client.PutObject(ctx, in); err != nil {
		if statusOf(err) == http.StatusPreconditionFailed {
			return errors.Newf(errors.TypeAlreadyExists, ErrCodeRequeueConflict, "the requeue changed since it was loaded")
		}
		return errors.Newf(errors.TypeInternal, ErrCodeBucket, "the requeue was not replaced: %d", statusOf(err))
	}
	return nil
}

// ReadReport reads the published report of runID back from the bucket.
//
// # Errors
//
// A run id that is not one, a report the bucket does not give, or one that is not whole.
func ReadReport(ctx context.Context, client *s3.Client, bucket, runID string) (Header, []PairRecord, error) {
	key, err := ReportKey(runID)
	if err != nil {
		return Header{}, nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return Header{}, nil, errors.Newf(errors.TypeNotFound, ErrCodeBucket, "the report is not in the bucket: %d", statusOf(err))
	}
	defer out.Body.Close()
	return ParseReport(out.Body)
}
