FROM node:24-trixie-slim@sha256:0711b541c1c33a8a530ac4f0d391baa9a15b3d804695b1b24a47daa5fb60e74d AS build
COPY buildFiles/npm/package*.json /app/
COPY buildFiles/npm/tsconfig.json /app/
WORKDIR /app
RUN npm ci
COPY buildFiles/npm/src /app/src
RUN npm run build

FROM node:24-trixie-slim@sha256:0711b541c1c33a8a530ac4f0d391baa9a15b3d804695b1b24a47daa5fb60e74d AS prod-deps
COPY buildFiles/npm/package*.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs24-debian13:latest@sha256:579735ae8373ff1ab6c4aa251480fd17ae6ec1b7f83b1bfc76bf6003d0fb242b AS worker
ARG CONTAINER_BUILD_VERSION
ENV CONTAINER_BUILD_VERSION=${CONTAINER_BUILD_VERSION}
COPY --from=build /app/dist/index.js /app/index.js
COPY --from=prod-deps /app/node_modules /app/node_modules
WORKDIR /app
STOPSIGNAL SIGTERM
CMD ["index.js"]
