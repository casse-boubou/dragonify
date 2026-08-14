FROM node:24-trixie-slim AS build
COPY buildFiles/npm/package*.json /app/
WORKDIR /app
RUN npm ci
COPY buildFiles/npm/src /app/src
RUN npm run build

FROM node:24-trixie-slim AS prod-deps
COPY buildFiles/npm/package*.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:latest AS worker
COPY --from=build /app/dist/index.js /app/index.js
COPY --from=prod-deps /app/node_modules /app/node_modules
WORKDIR /app
STOPSIGNAL SIGTERM
CMD ["index.js"]