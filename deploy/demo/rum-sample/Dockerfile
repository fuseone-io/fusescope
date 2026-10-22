FROM node:22.21.1-alpine
ARG FUSESCOPE_BROWSER_VERSION=next
WORKDIR /app
RUN npm pack "@fusescope/browser@${FUSESCOPE_BROWSER_VERSION}" \
 && tar -xzf fusescope-browser-*.tgz package/dist/fusescope.min.js \
 && mv package/dist/fusescope.min.js . \
 && rm -rf package fusescope-browser-*.tgz
COPY server.mjs index.html app.js ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
