# ARG necessaire pour la version des app FROM
ARG NODE_BASE_IMAGE_VERSION="24-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0"

##################################
# DOWNLOAD BUSYBOX TO USE ITS EXECUTABLE
##################################
FROM busybox:stable@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662 AS busybox


##################################
# BUILD NPM PROJECT
##################################
FROM node:${NODE_BASE_IMAGE_VERSION} AS build
COPY buildFiles/npm/package*.json /app/
COPY buildFiles/npm/tsconfig.json /app/
WORKDIR /app
RUN npm ci
COPY buildFiles/npm/src /app/src
RUN npm run build


##################################
# BUILD NPM NODE MODULES
##################################
FROM node:${NODE_BASE_IMAGE_VERSION} AS prod-deps
COPY buildFiles/npm/package*.json /app/
WORKDIR /app
RUN npm ci --omit=dev


##################################
# DRAGONIFY
##################################
FROM gcr.io/distroless/nodejs24-debian13:latest@sha256:2b39d276e969e32d23e7266aeb6b493ba96f13f86860a91d6f895c4e99fee25b AS worker
ARG CONTAINER_BUILD_VERSION
ENV CONTAINER_BUILD_VERSION=${CONTAINER_BUILD_VERSION}
COPY --from=busybox /bin/busybox /bin/busybox
COPY --from=build /app/dist/index.js /app/index.js
COPY --from=prod-deps /app/node_modules /app/node_modules
# Copy healthcheck
ENV HEARTBEAT_FILE="dragonify-heartbeat"
COPY healthcheck /app/healthcheck

##################################
## PRODUCTION MODE
##################################
WORKDIR /app
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s --start-interval=3s \
    CMD ["/bin/busybox", "sh", "healthcheck"]

CMD ["/app/index.js"]
