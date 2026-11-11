# syntax=docker/dockerfile:1
# The parity's staging image: the binary alone, on distroless static, as a non-root user. Every
# base is pinned by digest; the image never enters a production release.
FROM --platform=$BUILDPLATFORM golang:1.26.10@sha256:cfa27959837144bf4649802ba38e59daffd0dd2a7994aa83daaf113285b0f551 AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY pkg ./pkg
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/parity ./cmd/parity

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
LABEL org.opencontainers.image.source="https://github.com/fuseone-io/fusescope"
COPY --from=build /out/parity /parity
USER nonroot:nonroot
ENTRYPOINT ["/parity"]
