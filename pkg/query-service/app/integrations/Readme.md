# FuseScope integrations

Built-in integrations come from the signed catalog released by
[fusescope-integrations](https://github.com/fuseone-io/fusescope-integrations)
([ADR 0005](../../../../docs/adr/0005-integration-packages.md)). Change an
integration there, not here.

- `catalog/catalog.yaml` pins the catalog release and the sha256 of its `index.json`.
- `catalog/snapshot/` holds that release: `index.json`, its Sigstore bundle and one tarball per package version. It is embedded in the binary; nothing is fetched at runtime.
- At startup the loader checks `index.json` against the pin and each tarball against the index, then renders the packages. A bad package fails startup.
- Each installation is pinned to the package version it was installed at (`installed_integration.version`).

To move to another catalog release, run `make integrations-catalog CATALOG_VERSION=vX.Y.Z`: it downloads the release, verifies the bundle with cosign against the release workflow's identity, checks every package checksum and rewrites the pin and the snapshot. Without `CATALOG_VERSION` it re-fetches and re-verifies the pinned release. Then refresh the API golden files and review their diff:

```sh
go test ./pkg/query-service/app/integrations/ -run TestAPIContract -update
```
