package implrumapplication

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
	"github.com/fuseone-io/fusescope/pkg/valuer"
)

func (module *module) UploadSourceMaps(ctx context.Context, orgID valuer.UUID, id valuer.UUID, release string, createdBy string, parts rumtypes.PostableSourceMapParts) (*rumtypes.GettableUploadedSourceMaps, error) {
	release, err := rumtypes.NewSourceMapRelease(release)
	if err != nil {
		return nil, err
	}
	if _, err := module.Get(ctx, orgID, id); err != nil {
		return nil, err
	}
	existing, err := module.store.ListSourceMaps(ctx, orgID, id)
	if err != nil {
		return nil, err
	}

	limits := module.sourceMapLimits()
	plan := rumtypes.NewSourceMapUploadPlan(limits, existing, release)
	gettable := &rumtypes.GettableUploadedSourceMaps{Release: release, Files: []*rumtypes.SourceMapFile{}, Rejected: []*rumtypes.RejectedSourceMap{}}
	stored := []*rumtypes.StorableSourceMap{}
	fail := func(err error) (*rumtypes.GettableUploadedSourceMaps, error) {
		module.deleteSourceMapContent(ctx, stored)
		return nil, err
	}

	now := time.Now()
	for {
		part, err := parts.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fail(err)
		}

		file, rejection, err := module.storeSourceMap(ctx, plan, part, limits, orgID, id, release, createdBy, now)
		if err != nil {
			return fail(err)
		}
		if rejection != nil {
			gettable.Rejected = append(gettable.Rejected, rejection)
			continue
		}
		stored = append(stored, file)
	}
	applyDebugIDs(stored, parts.DebugIDs())

	replaced, err := module.commitSourceMaps(ctx, orgID, id, release, stored)
	if err != nil {
		return fail(err)
	}
	module.deleteSourceMapContent(ctx, replaced)
	module.symbolicator.Forget(id, release)

	for _, file := range stored {
		gettable.Files = append(gettable.Files, rumtypes.NewSourceMapFile(file))
	}
	gettable.Replaced = int64(len(replaced))
	return gettable, nil
}

func (module *module) ListSourceMaps(ctx context.Context, orgID valuer.UUID, id valuer.UUID, release string) (*rumtypes.GettableSourceMaps, error) {
	application, err := module.Get(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	files, err := module.store.ListSourceMaps(ctx, orgID, id)
	if err != nil {
		return nil, err
	}

	gettable := &rumtypes.GettableSourceMaps{
		Releases: rumtypes.NewSourceMapReleases(files, application.SourceMaps),
		Files:    []*rumtypes.SourceMapFile{},
		Limits:   module.sourceMapLimits(),
		Settings: application.SourceMaps,
	}
	for _, file := range files {
		gettable.SizeBytes += file.Size
	}
	if release == "" {
		return gettable, nil
	}

	release, err = rumtypes.NewSourceMapRelease(release)
	if err != nil {
		return nil, err
	}
	for _, listed := range gettable.Releases {
		if listed.Release == release {
			gettable.Releases = []*rumtypes.SourceMapRelease{listed}
			gettable.Files = rumtypes.NewSourceMapFiles(filterRelease(files, release))
			return gettable, nil
		}
	}
	return nil, errors.NewNotFoundf(rumtypes.ErrCodeSourceMapNotFound, "release %s has no source maps", release)
}

func (module *module) DeleteSourceMapRelease(ctx context.Context, orgID valuer.UUID, id valuer.UUID, release string) error {
	release, err := rumtypes.NewSourceMapRelease(release)
	if err != nil {
		return err
	}
	if _, err := module.Get(ctx, orgID, id); err != nil {
		return err
	}
	files, err := module.store.ListReleaseSourceMaps(ctx, id, release)
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return errors.NewNotFoundf(rumtypes.ErrCodeSourceMapNotFound, "release %s has no source maps", release)
	}
	return module.deleteSourceMaps(ctx, orgID, id, release, files)
}

func (module *module) DeleteSourceMap(ctx context.Context, orgID valuer.UUID, id valuer.UUID, fileID valuer.UUID) error {
	file, err := module.store.GetSourceMap(ctx, orgID, id, fileID)
	if err != nil {
		return err
	}
	return module.deleteSourceMaps(ctx, orgID, id, file.Release, []*rumtypes.StorableSourceMap{file})
}

func (module *module) CleanupSourceMaps(ctx context.Context) error {
	storables, err := module.store.ListApplicationsInAllOrgs(ctx)
	if err != nil {
		return err
	}
	applications, err := rumtypes.NewApplicationsFromStorables(storables)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, application := range applications {
		if err := ctx.Err(); err != nil {
			return err
		}
		files, err := module.store.ListSourceMaps(ctx, application.OrgID, application.ID)
		if err != nil {
			return err
		}
		for _, release := range rumtypes.ExpiredSourceMapReleases(rumtypes.NewSourceMapReleases(files, application.SourceMaps), now) {
			expired := filterRelease(files, release)
			if err := module.deleteSourceMaps(ctx, application.OrgID, application.ID, release, expired); err != nil {
				return err
			}
			module.settings.Logger().InfoContext(ctx, "deleted rum source maps past retention", slog.String("application_id", application.ID.StringValue()), slog.String("release", release), slog.Int("files", len(expired)))
		}
	}
	return nil
}

// storeSourceMap validates one part and writes its content. It returns a
// rejection for a part that is refused alone.
func (module *module) storeSourceMap(ctx context.Context, plan *rumtypes.SourceMapUploadPlan, part *rumtypes.PostableSourceMap, limits rumtypes.SourceMapLimits, orgID valuer.UUID, id valuer.UUID, release string, createdBy string, now time.Time) (*rumtypes.StorableSourceMap, *rumtypes.RejectedSourceMap, error) {
	path, err := rumtypes.NewSourceMapPath(part.Path)
	if err != nil {
		return nil, &rumtypes.RejectedSourceMap{Path: part.Path, Reason: errorMessage(err)}, nil
	}
	data, err := io.ReadAll(io.LimitReader(part.Content, limits.MaxFileSize+1))
	if err != nil {
		return nil, nil, errors.WrapInvalidInputf(err, rumtypes.ErrCodeSourceMapInvalidInput, "failed to read source map %s from the request", path)
	}

	debugID := ""
	if size := int64(len(data)); size > 0 && size <= limits.MaxFileSize {
		sourceMap, err := rumtypes.ParseSourceMap(data)
		if err != nil {
			return nil, &rumtypes.RejectedSourceMap{Path: path, Reason: errorMessage(err)}, nil
		}
		debugID = sourceMap.DebugID()
	}
	rejection, err := plan.Add(path, int64(len(data)))
	if err != nil {
		return nil, nil, err
	}
	if rejection != "" {
		return nil, &rumtypes.RejectedSourceMap{Path: path, Reason: rejection}, nil
	}

	file := rumtypes.NewStorableSourceMap(orgID, id, release, path, debugID, int64(len(data)), createdBy, now)
	if err := module.storage.Put(ctx, file.StorageKey(), bytes.NewReader(data)); err != nil {
		return nil, nil, err
	}
	return file, nil, nil
}

// commitSourceMaps checks the limits again against what is stored now, then
// swaps the replaced rows for the new ones and returns the replaced.
func (module *module) commitSourceMaps(ctx context.Context, orgID valuer.UUID, id valuer.UUID, release string, stored []*rumtypes.StorableSourceMap) ([]*rumtypes.StorableSourceMap, error) {
	if len(stored) == 0 {
		return nil, nil
	}

	var replaced []*rumtypes.StorableSourceMap
	err := module.store.RunInTx(ctx, func(ctx context.Context) error {
		current, err := module.store.ListSourceMaps(ctx, orgID, id)
		if err != nil {
			return err
		}
		plan := rumtypes.NewSourceMapUploadPlan(module.sourceMapLimits(), current, release)
		for _, file := range stored {
			rejection, err := plan.Add(file.Path, file.Size)
			if err != nil {
				return err
			}
			if rejection != "" {
				return errors.NewInvalidInputf(rumtypes.ErrCodeSourceMapInvalidInput, "source map %s: %s", file.Path, rejection)
			}
		}

		replaced = plan.Replaced()
		ids := make([]valuer.UUID, 0, len(replaced))
		for _, file := range replaced {
			ids = append(ids, file.ID)
		}
		if err := module.store.DeleteSourceMaps(ctx, orgID, id, ids); err != nil {
			return err
		}
		return module.store.CreateSourceMaps(ctx, stored)
	})
	return replaced, err
}

func (module *module) deleteSourceMaps(ctx context.Context, orgID valuer.UUID, id valuer.UUID, release string, files []*rumtypes.StorableSourceMap) error {
	ids := make([]valuer.UUID, 0, len(files))
	for _, file := range files {
		ids = append(ids, file.ID)
	}
	if err := module.store.DeleteSourceMaps(ctx, orgID, id, ids); err != nil {
		return err
	}
	module.deleteSourceMapContent(ctx, files)
	module.symbolicator.Forget(id, release)
	return nil
}

// deleteSourceMapContent is best effort: content left behind is unreachable.
func (module *module) deleteSourceMapContent(ctx context.Context, files []*rumtypes.StorableSourceMap) {
	for _, file := range files {
		if err := module.storage.Delete(context.WithoutCancel(ctx), file.StorageKey()); err != nil {
			module.settings.Logger().WarnContext(ctx, "failed to delete rum source map content", slog.String("source_map_id", file.ID.StringValue()), errors.Attr(err))
		}
	}
}

func (module *module) flushSourceMapUsage(ctx context.Context) error {
	usage := module.symbolicator.TakeUsage()
	if len(usage) == 0 {
		return nil
	}
	ids, latest := make([]valuer.UUID, 0, len(usage)), time.Time{}
	for id, usedAt := range usage {
		ids = append(ids, id)
		if usedAt.After(latest) {
			latest = usedAt
		}
	}
	return module.store.SetSourceMapsLastUsedAt(ctx, ids, latest)
}

func (module *module) sourceMapLimits() rumtypes.SourceMapLimits {
	return rumtypes.SourceMapLimits{MaxFileSize: module.config.SourceMaps.MaxFileSize, MaxFilesPerRelease: module.config.SourceMaps.MaxFilesPerRelease, Quota: module.config.SourceMaps.Quota}
}

// applyDebugIDs lets the uploader's debug IDs, by URL path, override the
// maps' own.
func applyDebugIDs(files []*rumtypes.StorableSourceMap, debugIDs map[string]string) {
	byPath := map[string]string{}
	for path, debugID := range debugIDs {
		if normalized, err := rumtypes.NewSourceMapPath(path); err == nil {
			byPath[normalized] = rumtypes.NewSourceMapDebugID(debugID)
		}
	}
	for _, file := range files {
		if debugID := byPath[file.Path]; debugID != "" {
			file.DebugID = debugID
		}
	}
}

func filterRelease(files []*rumtypes.StorableSourceMap, release string) []*rumtypes.StorableSourceMap {
	kept := []*rumtypes.StorableSourceMap{}
	for _, file := range files {
		if file.Release == release {
			kept = append(kept, file)
		}
	}
	return kept
}

func errorMessage(err error) string {
	_, _, message, _, _, _ := errors.Unwrapb(err)
	return message
}
