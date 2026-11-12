package parityrun

import (
	"context"
	"net"
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
)

// addressed records the host and path of every request before the bucket answers it, rewriting a
// virtual-hosted request to the path the bucket serves.
type addressed struct {
	mu       sync.Mutex
	requests []string
	bucket   *bucket
}

func (a *addressed) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host, _, _ := net.SplitHostPort(r.Host)
	a.mu.Lock()
	a.requests = append(a.requests, host+" "+r.URL.Path)
	a.mu.Unlock()
	if strings.HasPrefix(host, "parity-staging.") {
		r.URL.Path = "/parity-staging" + r.URL.Path
	}
	a.bucket.ServeHTTP(w, r)
}

// storeClient is the client the parity builds for an endpoint named by host, as a store behind a
// Service is; every connection reaches the test server, whatever host the client asks for.
func storeClient(t *testing.T, pathStyle bool) (*s3.Client, func() []string) {
	t.Helper()
	a := &addressed{bucket: &bucket{objects: map[string]*object{}}}
	server := httptest.NewServer(a)
	t.Cleanup(server.Close)
	_, port, err := net.SplitHostPort(server.Listener.Addr().String())
	require.NoError(t, err)
	dial := &net.Dialer{}
	cfg := aws.Config{
		Region: "us-east-1", BaseEndpoint: aws.String("http://store.example.svc:" + port),
		Credentials: credentials.NewStaticCredentialsProvider("test", "test", ""),
		HTTPClient: &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dial.DialContext(ctx, network, server.Listener.Addr().String())
		}}},
	}
	return NewBucketClient(cfg, BucketSettings{PathStyle: pathStyle}), func() []string {
		a.mu.Lock()
		defer a.mu.Unlock()
		return append([]string(nil), a.requests...)
	}
}

func TestTheBucketIsAddressedAsItsSettingsSay(t *testing.T) {
	for _, tc := range []struct {
		pathStyle bool
		host      string
		prefix    string
	}{
		{pathStyle: false, host: "parity-staging.store.example.svc", prefix: "/"},
		{pathStyle: true, host: "store.example.svc", prefix: "/parity-staging/"},
	} {
		client, requests := storeClient(t, tc.pathStyle)
		sink := S3Sink{Client: client, Config: s3cfg, Local: FileSink{Dir: t.TempDir()}}
		w, err := sink.Create("20261111t235959z-7")
		require.NoError(t, err)
		require.NoError(t, w.Write(Header{Seed: 7}))
		require.NoError(t, w.Publish(t.Context(), Summary{Usable: true}), "path_style=%v: the report", tc.pathStyle)

		q := S3Requeue{Client: client, Config: s3cfg}
		_, version, err := q.Load(t.Context())
		require.NoError(t, err, "path_style=%v: the requeue loads", tc.pathStyle)
		require.NoError(t, q.Replace(t.Context(), version, []PairSpec{queued("a")}), "path_style=%v: the requeue", tc.pathStyle)

		header, _, err := ReadReport(t.Context(), client, s3cfg.Bucket, "20261111t235959z-7")
		require.NoError(t, err, "path_style=%v: the investigation reads the report", tc.pathStyle)
		assert.Equal(t, uint64(7), header.Seed)

		got := requests()
		require.Len(t, got, 4, "publish, load, replace, read")
		for _, r := range got {
			host, path, _ := strings.Cut(r, " ")
			assert.Equal(t, tc.host, host, "path_style=%v", tc.pathStyle)
			assert.True(t, strings.HasPrefix(path, tc.prefix) && !strings.HasPrefix(strings.TrimPrefix(path, tc.prefix), "parity-staging/"), "path_style=%v: %s", tc.pathStyle, path)
		}
	}
}
