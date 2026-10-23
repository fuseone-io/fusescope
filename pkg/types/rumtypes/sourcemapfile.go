package rumtypes

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/url"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types"
	"github.com/fuseone-io/fusescope/pkg/valuer"
	"github.com/uptrace/bun"
)

const (
	// SourceMapKeptReleases is how many of the newest releases
	// KeepNewestReleases protects from retention.
	SourceMapKeptReleases  = 3
	maxSourceMapPathLength = 1024
	maxReleaseLength       = 128
	sourceMapExtension     = ".map"
)

var (
	ErrCodeSourceMapInvalidInput = errors.MustNewCode("rum_source_map_invalid_input")
	ErrCodeSourceMapTooLarge     = errors.MustNewCode("rum_source_map_too_large")
	ErrCodeSourceMapNotFound     = errors.MustNewCode("rum_source_map_not_found")
)

var (
	SourceMapRetention30Days  = SourceMapRetention{valuer.NewString("30d")}
	SourceMapRetention90Days  = SourceMapRetention{valuer.NewString("90d")}
	SourceMapRetentionOneYear = SourceMapRetention{valuer.NewString("1y")}
	SourceMapRetentionNever   = SourceMapRetention{valuer.NewString("never")}
)

// SourceMapRetention is how long a release's maps are kept after their last
// use, or after upload when never used.
type SourceMapRetention struct{ valuer.String }

type SourceMapSettings struct {
	Retention          SourceMapRetention `json:"retention" required:"true" description:"Delete a release's maps when not used for this long. Defaults to 90d."`
	KeepNewestReleases bool               `json:"keepNewestReleases" required:"true" description:"Never delete the 3 most recently uploaded releases. Defaults to true."`
}

type StorableSourceMap struct {
	bun.BaseModel `bun:"table:rum_source_map,alias:rum_source_map"`

	types.Identifiable
	types.TimeAuditable
	OrgID         valuer.UUID `bun:"org_id"`
	ApplicationID valuer.UUID `bun:"application_id"`
	Release       string      `bun:"release_name"`
	Path          string      `bun:"path"`
	DebugID       string      `bun:"debug_id"`
	Size          int64       `bun:"size"`
	CreatedBy     string      `bun:"created_by"`
	LastUsedAt    *time.Time  `bun:"last_used_at,nullzero"`
}

type SourceMapLimits struct {
	MaxFileSize        int64 `json:"maxFileSize" required:"true" description:"Bytes."`
	MaxFilesPerRelease int   `json:"maxFilesPerRelease" required:"true"`
	Quota              int64 `json:"quota" required:"true" description:"Bytes of maps one application holds."`
}

type ListSourceMapsParams struct {
	Release string `query:"release" description:"List this release's files. Without it, the releases are listed."`
}

type PostableSourceMapsParams struct {
	Release string `query:"release" required:"true" description:"The release the maps belong to; it must equal the service.version the SDK reports."`
}

type DeleteSourceMapsParams struct {
	Release string `query:"release" required:"true"`
}

// PostableSourceMaps documents the multipart body, which the handler
// streams: besides these fields, every part whose name is a URL path is a
// map served from that path.
type PostableSourceMaps struct {
	DebugIDs string         `formData:"debug_ids" description:"JSON object of map URL path to debug ID; overrides the map's own debugId."`
	File     multipart.File `formData:"file" description:"A map whose filename is its URL path, for clients that cannot name parts freely."`
}

// PostableSourceMap is one map of an upload: its path and a reader of its
// content.
type PostableSourceMap struct {
	Path    string
	Content io.Reader
}

// PostableSourceMapParts yields an upload's maps.
type PostableSourceMapParts interface {
	// Next returns io.EOF after the last map.
	Next() (*PostableSourceMap, error)

	// DebugIDs maps URL paths to debug IDs; it is complete once Next returned io.EOF.
	DebugIDs() map[string]string
}

type GettableSourceMaps struct {
	Releases  []*SourceMapRelease `json:"releases" required:"true" description:"Newest upload first. With release set, only that release."`
	Files     []*SourceMapFile    `json:"files" required:"true" description:"The files of the requested release, by path; empty without release."`
	SizeBytes int64               `json:"sizeBytes" required:"true" description:"Bytes of maps the application holds."`
	Limits    SourceMapLimits     `json:"limits" required:"true"`
	Settings  SourceMapSettings   `json:"settings" required:"true"`
}

type GettableUploadedSourceMaps struct {
	Release  string               `json:"release" required:"true"`
	Files    []*SourceMapFile     `json:"files" required:"true" description:"The stored files, in request order."`
	Rejected []*RejectedSourceMap `json:"rejected" required:"true" description:"Files not stored, in request order; the others are."`
	Replaced int64                `json:"replaced" required:"true" description:"Stored files that replaced one with the same path."`
}

type RejectedSourceMap struct {
	Path   string `json:"path" required:"true"`
	Reason string `json:"reason" required:"true"`
}

type SourceMapRelease struct {
	Release    string     `json:"release" required:"true"`
	Files      int64      `json:"files" required:"true"`
	SizeBytes  int64      `json:"sizeBytes" required:"true"`
	UploadedAt time.Time  `json:"uploadedAt" required:"true" description:"Latest upload to the release."`
	UploadedBy string     `json:"uploadedBy" required:"true" description:"Email of the user or service account of the latest upload."`
	LastUsedAt *time.Time `json:"lastUsedAt" required:"true" nullable:"true" description:"Last time a stack trace was symbolicated with one of its maps."`
	ExpiresAt  *time.Time `json:"expiresAt" required:"true" nullable:"true" description:"When retention deletes it; null when it is kept."`
}

type SourceMapFile struct {
	ID            valuer.UUID `json:"id" required:"true"`
	Path          string      `json:"path" required:"true"`
	GeneratedPath string      `json:"generatedPath" required:"true" description:"URL path of the bundle the map matches by convention: path without .map."`
	DebugID       string      `json:"debugId" required:"true" description:"The map's debugId, lowercase; empty when it has none."`
	SizeBytes     int64       `json:"sizeBytes" required:"true"`
	UploadedAt    time.Time   `json:"uploadedAt" required:"true"`
	UploadedBy    string      `json:"uploadedBy" required:"true"`
	LastUsedAt    *time.Time  `json:"lastUsedAt" required:"true" nullable:"true"`
}

// SourceMapIndex finds the map of a stack frame's file among one release's
// maps.
type SourceMapIndex struct {
	byGeneratedPath map[string]*StorableSourceMap
	byDebugID       map[string]*StorableSourceMap
}

// SourceMapUploadPlan checks an upload against the limits as its files
// arrive, so a request fails before it stores more than allowed.
type SourceMapUploadPlan struct {
	limits          SourceMapLimits
	release         string
	applicationSize int64
	releaseFiles    map[string]*StorableSourceMap
	added           map[string]int64
	order           []string
}

func (SourceMapRetention) Enum() []any {
	return []any{SourceMapRetention30Days, SourceMapRetention90Days, SourceMapRetentionOneYear, SourceMapRetentionNever}
}

// Duration reports false for never.
func (retention SourceMapRetention) Duration() (time.Duration, bool) {
	switch retention {
	case SourceMapRetention30Days:
		return 30 * 24 * time.Hour, true
	case SourceMapRetention90Days:
		return 90 * 24 * time.Hour, true
	case SourceMapRetentionOneYear:
		return 365 * 24 * time.Hour, true
	}
	return 0, false
}

func NewDefaultSourceMapSettings() SourceMapSettings {
	return SourceMapSettings{Retention: SourceMapRetention90Days, KeepNewestReleases: true}
}

func (settings SourceMapSettings) Validate() error {
	if !slices.Contains(settings.Retention.Enum(), any(settings.Retention)) {
		return errors.NewInvalidInputf(ErrCodeApplicationInvalidInput, "sourceMaps.retention must be 30d, 90d, 1y or never, got %q", settings.Retention.StringValue())
	}
	return nil
}

func (settings *SourceMapSettings) UnmarshalJSON(data []byte) error {
	type alias SourceMapSettings
	temp := alias(NewDefaultSourceMapSettings())
	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}
	if err := SourceMapSettings(temp).Validate(); err != nil {
		return err
	}
	*settings = SourceMapSettings(temp)
	return nil
}

func NewStorableSourceMap(orgID valuer.UUID, applicationID valuer.UUID, release string, path string, debugID string, size int64, createdBy string, now time.Time) *StorableSourceMap {
	now = now.UTC()
	return &StorableSourceMap{
		Identifiable:  types.Identifiable{ID: valuer.GenerateUUID()},
		TimeAuditable: types.TimeAuditable{CreatedAt: now, UpdatedAt: now},
		OrgID:         orgID,
		ApplicationID: applicationID,
		Release:       release,
		Path:          path,
		DebugID:       debugID,
		Size:          size,
		CreatedBy:     createdBy,
	}
}

// NewSourceMapRelease validates the release an upload, list or delete names.
func NewSourceMapRelease(release string) (string, error) {
	release = strings.TrimSpace(release)
	if release == "" || len(release) > maxReleaseLength {
		return "", errors.NewInvalidInputf(ErrCodeSourceMapInvalidInput, "release must be 1 to %d characters, the service.version the SDK reports", maxReleaseLength)
	}
	return release, nil
}

// NewSourceMapPath normalizes the URL path a map is served from: a relative
// path gets a leading slash, a URL keeps its path, escapes are decoded.
func NewSourceMapPath(raw string) (string, error) {
	normalized, ok := normalizeURLPath(raw)
	if !ok || normalized == "/" || len(normalized) > maxSourceMapPathLength {
		return "", errors.NewInvalidInputf(ErrCodeSourceMapInvalidInput, "source map path %q must be the URL path it is served from, up to %d characters, e.g. /assets/index-abc123.js.map", raw, maxSourceMapPathLength)
	}
	return normalized, nil
}

func (file *StorableSourceMap) GeneratedPath() string {
	return strings.TrimSuffix(file.Path, sourceMapExtension)
}

// StorageKey names the file's content in the storage; it never holds user
// input.
func (file *StorableSourceMap) StorageKey() string {
	return file.OrgID.StringValue() + "/" + file.ApplicationID.StringValue() + "/" + file.ID.StringValue() + sourceMapExtension
}

func NewSourceMapFile(file *StorableSourceMap) *SourceMapFile {
	return &SourceMapFile{
		ID:            file.ID,
		Path:          file.Path,
		GeneratedPath: file.GeneratedPath(),
		DebugID:       file.DebugID,
		SizeBytes:     file.Size,
		UploadedAt:    file.CreatedAt,
		UploadedBy:    file.CreatedBy,
		LastUsedAt:    file.LastUsedAt,
	}
}

func NewSourceMapFiles(files []*StorableSourceMap) []*SourceMapFile {
	gettable := make([]*SourceMapFile, 0, len(files))
	for _, file := range files {
		gettable = append(gettable, NewSourceMapFile(file))
	}
	slices.SortFunc(gettable, func(a, b *SourceMapFile) int { return strings.Compare(a.Path, b.Path) })
	return gettable
}

// NewSourceMapReleases aggregates an application's files by release, newest
// upload first, with the expiry the settings give each.
func NewSourceMapReleases(files []*StorableSourceMap, settings SourceMapSettings) []*SourceMapRelease {
	byRelease := map[string]*SourceMapRelease{}
	releases := []*SourceMapRelease{}
	for _, file := range files {
		release, ok := byRelease[file.Release]
		if !ok {
			release = &SourceMapRelease{Release: file.Release}
			byRelease[file.Release] = release
			releases = append(releases, release)
		}
		release.Files++
		release.SizeBytes += file.Size
		if file.CreatedAt.After(release.UploadedAt) {
			release.UploadedAt, release.UploadedBy = file.CreatedAt, file.CreatedBy
		}
		if file.LastUsedAt != nil && (release.LastUsedAt == nil || file.LastUsedAt.After(*release.LastUsedAt)) {
			release.LastUsedAt = file.LastUsedAt
		}
	}

	slices.SortFunc(releases, func(a, b *SourceMapRelease) int {
		if order := b.UploadedAt.Compare(a.UploadedAt); order != 0 {
			return order
		}
		return strings.Compare(b.Release, a.Release)
	})

	retention, expires := settings.Retention.Duration()
	for i, release := range releases {
		if !expires || (settings.KeepNewestReleases && i < SourceMapKeptReleases) {
			continue
		}
		since := release.UploadedAt
		if release.LastUsedAt != nil && release.LastUsedAt.After(since) {
			since = *release.LastUsedAt
		}
		expiresAt := since.Add(retention)
		release.ExpiresAt = &expiresAt
	}
	return releases
}

func ExpiredSourceMapReleases(releases []*SourceMapRelease, now time.Time) []string {
	var expired []string
	for _, release := range releases {
		if release.ExpiresAt != nil && !now.Before(*release.ExpiresAt) {
			expired = append(expired, release.Release)
		}
	}
	return expired
}

func NewSourceMapIndex(files []*StorableSourceMap) *SourceMapIndex {
	index := &SourceMapIndex{byGeneratedPath: map[string]*StorableSourceMap{}, byDebugID: map[string]*StorableSourceMap{}}
	for _, file := range files {
		if normalized, ok := normalizeURLPath(file.GeneratedPath()); ok {
			index.byGeneratedPath[normalized] = file
		}
		if file.DebugID != "" {
			index.byDebugID[file.DebugID] = file
		}
	}
	return index
}

func (index *SourceMapIndex) Len() int {
	return len(index.byGeneratedPath)
}

// Match finds a frame file's map by debug ID, then by the URL path of the
// bundle: the map uploaded at the bundle's path plus .map, or at the path
// itself. When none matches the whole path, the longest match of its
// trailing segments wins, for apps served under a prefix.
func (index *SourceMapIndex) Match(file string, debugID string) *StorableSourceMap {
	if match, ok := index.byDebugID[strings.ToLower(debugID)]; ok && debugID != "" {
		return match
	}
	if !strings.Contains(file, "/") {
		return nil
	}
	normalized, ok := normalizeURLPath(file)
	if !ok {
		return nil
	}
	for suffix := normalized; ; {
		if match, ok := index.byGeneratedPath[suffix]; ok {
			return match
		}
		next := strings.Index(suffix[1:], "/")
		if next < 0 {
			return nil
		}
		suffix = suffix[next+1:]
	}
}

func NewSourceMapUploadPlan(limits SourceMapLimits, existing []*StorableSourceMap, release string) *SourceMapUploadPlan {
	plan := &SourceMapUploadPlan{limits: limits, release: release, releaseFiles: map[string]*StorableSourceMap{}, added: map[string]int64{}}
	for _, file := range existing {
		plan.applicationSize += file.Size
		if file.Release == release {
			plan.releaseFiles[file.Path] = file
		}
	}
	return plan
}

// Add counts a file of size bytes, a size above the limit standing for a
// read stopped there. It returns why the file alone is rejected, or an error
// that fails the whole upload.
func (plan *SourceMapUploadPlan) Add(path string, size int64) (string, error) {
	if _, ok := plan.added[path]; ok {
		return "the path is in the request twice", nil
	}
	if size == 0 {
		return "the file is empty", nil
	}
	if size > plan.limits.MaxFileSize {
		return fmt.Sprintf("the file is larger than %d bytes", plan.limits.MaxFileSize), nil
	}

	replaced, replaces := plan.releaseFiles[path]
	if !replaces && len(plan.releaseFiles)+plan.newFiles()+1 > plan.limits.MaxFilesPerRelease {
		return "", errors.NewInvalidInputf(ErrCodeSourceMapInvalidInput, "release %s would hold more than %d source maps", plan.release, plan.limits.MaxFilesPerRelease)
	}
	projected := plan.applicationSize + size
	if replaces {
		projected -= replaced.Size
	}
	if projected > plan.limits.Quota {
		return "", errors.Newf(errors.TypePayloadTooLarge, ErrCodeSourceMapTooLarge, "the application would hold more than %d bytes of source maps; delete old releases or shorten their retention", plan.limits.Quota)
	}

	plan.applicationSize = projected
	plan.added[path] = size
	plan.order = append(plan.order, path)
	return "", nil
}

// Replaced returns the stored files the added ones replace.
func (plan *SourceMapUploadPlan) Replaced() []*StorableSourceMap {
	replaced := []*StorableSourceMap{}
	for _, path := range plan.order {
		if file, ok := plan.releaseFiles[path]; ok {
			replaced = append(replaced, file)
		}
	}
	return replaced
}

func (plan *SourceMapUploadPlan) newFiles() int {
	count := 0
	for path := range plan.added {
		if _, ok := plan.releaseFiles[path]; !ok {
			count++
		}
	}
	return count
}

// normalizeURLPath reduces a URL or path to its decoded, cleaned path.
func normalizeURLPath(raw string) (string, bool) {
	raw = strings.ReplaceAll(strings.TrimSpace(raw), `\`, "/")
	if raw == "" {
		return "", false
	}
	if urlScheme.MatchString(raw) {
		parsed, err := url.Parse(raw)
		if err != nil {
			return "", false
		}
		raw = parsed.EscapedPath()
	}
	if end := strings.IndexAny(raw, "?#"); end >= 0 {
		raw = raw[:end]
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return "", false
	}
	return path.Clean("/" + decoded), true
}
