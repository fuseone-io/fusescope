# syntax=docker/dockerfile:1
# The parity's staging image: the binary, its licenses and those of every module it links, on
# distroless static, as a non-root user. Every base is pinned by digest; the image never enters a
# production release.
FROM --platform=$BUILDPLATFORM golang:1.26.10@sha256:cfa27959837144bf4649802ba38e59daffd0dd2a7994aa83daaf113285b0f551 AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/parity ./cmd/parity
COPY pkg ./pkg
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/parity ./cmd/parity
COPY LICENSE NOTICE /out/licenses/
# Each linked module's license and notice files, under its module path; a module without a
# license file fails the build.
RUN set -eu; \
    cp "$(go env GOROOT)/LICENSE" /out/licenses/go.LICENSE; \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go list -deps \
      -f '{{with .Module}}{{if not .Main}}{{.Path}}@{{.Version}} {{.Dir}}{{end}}{{end}}' ./cmd/parity \
      | sort -u | while read -r module dir; do \
        found=$(find "$dir" -maxdepth 1 -type f \( -iname 'licen[cs]e*' -o -iname 'copying*' -o -iname 'notice*' \)); \
        if ! echo "$found" | grep -qiE '/(licen[cs]e|copying)[^/]*$'; then echo "no license file in $module" >&2; exit 1; fi; \
        mkdir -p "/out/licenses/modules/$module"; \
        echo "$found" | while read -r f; do cp "$f" "/out/licenses/modules/$module/"; done; \
      done

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
LABEL org.opencontainers.image.source="https://github.com/fuseone-io/fusescope"
LABEL org.opencontainers.image.licenses="MIT"
COPY --from=build /out/licenses /licenses
COPY --from=build /out/parity /parity
USER nonroot:nonroot
ENTRYPOINT ["/parity"]
