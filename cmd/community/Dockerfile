FROM alpine:3.20.3
LABEL maintainer="fuseone"
LABEL org.opencontainers.image.source="https://github.com/fuseone-io/fusescope"
WORKDIR /root

ARG OS="linux"
ARG TARGETARCH

RUN apk update && \
	apk add ca-certificates && \
	rm -rf /var/cache/apk/*


COPY ./target/${OS}-${TARGETARCH}/fusescope /root/fusescope
COPY ./templates /root/templates
COPY frontend/build/ /etc/signoz/web/

RUN chmod 755 /root /root/fusescope

ENTRYPOINT ["./fusescope", "server"]