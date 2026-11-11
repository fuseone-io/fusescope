package parityrun

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fuseone-io/fusescope/pkg/parity"
)

type object struct {
	body    []byte
	etag    string
	headers http.Header
}

// bucket is an S3 that honours If-Match and If-None-Match on PUT, as S3 does.
type bucket struct {
	mu      sync.Mutex
	objects map[string]*object
	version int
	fail    int
}

func (b *bucket) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.fail != 0 {
		w.WriteHeader(b.fail)
		return
	}
	key := strings.TrimPrefix(r.URL.Path, "/parity-staging/")
	current := b.objects[key]
	switch r.Method {
	case http.MethodPut:
		precondition := (r.Header.Get("If-None-Match") == "*" && current != nil) ||
			(r.Header.Get("If-Match") != "" && (current == nil || current.etag != r.Header.Get("If-Match")))
		if precondition {
			w.WriteHeader(http.StatusPreconditionFailed)
			_, _ = io.WriteString(w, `<Error><Code>PreconditionFailed</Code></Error>`)
			return
		}
		body, _ := io.ReadAll(r.Body)
		b.version++
		b.objects[key] = &object{body: body, etag: fmt.Sprintf(`"v%d"`, b.version), headers: r.Header.Clone()}
		w.Header().Set("ETag", b.objects[key].etag)
	case http.MethodGet:
		if current == nil {
			w.WriteHeader(http.StatusNotFound)
			_, _ = io.WriteString(w, `<Error><Code>NoSuchKey</Code></Error>`)
			return
		}
		w.Header().Set("ETag", current.etag)
		w.Header().Set("Content-Length", fmt.Sprint(len(current.body)))
		_, _ = w.Write(current.body)
	}
}

func s3Client(t *testing.T) (*bucket, *s3.Client) {
	t.Helper()
	b := &bucket{objects: map[string]*object{}}
	server := httptest.NewServer(b)
	t.Cleanup(server.Close)
	client := s3.New(s3.Options{
		BaseEndpoint: aws.String(server.URL), UsePathStyle: true, Region: "us-east-1",
		Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""),
	})
	return b, client
}

var s3cfg = S3Config{Bucket: "parity-staging", KMSKeyID: "arn:aws:kms:us-east-1:1:key/requeue", MaxQueueBytes: 1 << 20, MaxQueueSpecs: 3}

func TestAReportIsUploadedOnceWithItsChecksum(t *testing.T) {
	b, client := s3Client(t)
	sink := S3Sink{Client: client, Config: s3cfg, Local: FileSink{Dir: t.TempDir()}}
	w, err := sink.Create("20261111t235959z-7")
	require.NoError(t, err)
	require.NoError(t, w.Write(Header{Seed: 7}))
	require.NoError(t, w.Publish(Summary{Usable: true}))
	o := b.objects["reports/2026/11/11/20261111t235959z-7.jsonl"]
	require.NotNil(t, o, "under the day the round started, whenever it is uploaded")
	sum := sha256.Sum256(o.body)
	assert.Equal(t, base64.StdEncoding.EncodeToString(sum[:]), o.headers.Get("X-Amz-Checksum-Sha256"))
	assert.Equal(t, "*", o.headers.Get("If-None-Match"), "created once")
	assert.Contains(t, string(o.body), `"kind":"summary"`)

	header, records, err := ReadReport(t.Context(), client, s3cfg.Bucket, "20261111t235959z-7")
	require.NoError(t, err, "read back by its run id")
	assert.Equal(t, uint64(7), header.Seed)
	assert.Empty(t, records)
	_, _, err = ReadReport(t.Context(), client, s3cfg.Bucket, "not-a-run-id")
	assert.Error(t, err)

	again, err := sink.Create("20261111t235959z-7")
	require.NoError(t, err)
	assert.Error(t, again.Publish(Summary{}), "never over an earlier report")
}

func TestAReportTheBucketRefusesIsNotPublished(t *testing.T) {
	b, client := s3Client(t)
	b.fail = http.StatusForbidden
	sink := S3Sink{Client: client, Config: s3cfg, Local: FileSink{Dir: t.TempDir()}}
	w, err := sink.Create("20261111t000000z-2")
	require.NoError(t, err)
	assert.Error(t, w.Publish(Summary{}))
}

func queued(trace string) PairSpec {
	return PairSpec{View: ViewSummary, Org: orgA, Class: parity.Settled, TraceID: trace, Window: minuteWindow}
}

func TestTheQueueIsReplacedOnlyAtTheVersionLoaded(t *testing.T) {
	b, client := s3Client(t)
	q := S3Requeue{Client: client, Config: s3cfg}
	specs, version, err := q.Load(t.Context())
	require.NoError(t, err)
	assert.Empty(t, specs, "no object: an empty queue")
	assert.Empty(t, version)

	one := []PairSpec{queued("a")}
	require.NoError(t, q.Replace(t.Context(), version, one))
	o := b.objects["requeue/queue.json"]
	require.NotNil(t, o)
	assert.Equal(t, "*", o.headers.Get("If-None-Match"), "the first queue is created once")
	assert.Equal(t, "aws:kms", o.headers.Get("X-Amz-Server-Side-Encryption"))
	assert.Equal(t, s3cfg.KMSKeyID, o.headers.Get("X-Amz-Server-Side-Encryption-Aws-Kms-Key-Id"), "the queue's own key, every write")
	assert.Contains(t, string(o.body), `"format":1`)

	got, loaded, err := q.Load(t.Context())
	require.NoError(t, err)
	assert.Equal(t, one, got)
	assert.Error(t, q.Replace(t.Context(), version, nil), "a stale version: 412")
	require.NoError(t, q.Replace(t.Context(), loaded, nil))
	assert.Equal(t, loaded, b.objects["requeue/queue.json"].headers.Get("If-Match"))
}

func TestAQueueOverItsLimitsIsRefusedBothWays(t *testing.T) {
	b, client := s3Client(t)
	q := S3Requeue{Client: client, Config: s3cfg}
	four := []PairSpec{queued("a"), queued("b"), queued("c"), queued("d")}
	assert.Error(t, q.Replace(t.Context(), "", four), "more specs than the limit")

	b.objects["requeue/queue.json"] = &object{body: []byte(`{"format":1,"specs":[{},{},{},{}]}`), etag: `"x"`}
	_, _, err := q.Load(t.Context())
	assert.Error(t, err, "too many specs on load")

	b.objects["requeue/queue.json"] = &object{body: []byte(`{"format":1,"specs":[]}`), etag: `"z"`}
	small := s3cfg
	small.MaxQueueBytes = 10
	_, _, err = S3Requeue{Client: client, Config: small}.Load(t.Context())
	assert.Error(t, err, "too many bytes, before decoding")

	b.objects["requeue/queue.json"] = &object{body: []byte(`{"format":2,"specs":[]}`), etag: `"y"`}
	_, _, err = q.Load(t.Context())
	assert.Error(t, err, "an unknown format fails loudly")
}

func TestAQueueTheBucketDoesNotAnswerIsAnError(t *testing.T) {
	b, client := s3Client(t)
	b.fail = http.StatusInternalServerError
	q := S3Requeue{Client: client, Config: s3cfg}
	_, _, err := q.Load(t.Context())
	assert.Error(t, err, "only 404 is an empty queue")
	assert.Error(t, q.Replace(t.Context(), "", nil))
}
