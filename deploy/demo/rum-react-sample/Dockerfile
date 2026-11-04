FROM node:22.23.4-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY build.mjs ./
COPY src ./src
RUN node build.mjs

FROM node:22.23.4-alpine
WORKDIR /app
COPY --from=build /src/dist/app.js ./
COPY server.mjs index.html ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
