FROM golang:1.24-alpine AS build

RUN apk add --no-cache \
    gcc \
    musl-dev

WORKDIR /build
ENV GOFLAGS="-buildvcs=false"

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG BITMAGNET_GIT_TAG=local
RUN go build -o /tmp/bitmagnet \
    -ldflags "-s -w -X github.com/nigowl/bitmagnet/internal/version.GitTag=${BITMAGNET_GIT_TAG}"

FROM alpine:3.20

RUN apk add --no-cache \
    curl \
    iproute2-ss \
    ca-certificates \
    ffmpeg

COPY --from=build /tmp/bitmagnet /usr/bin/bitmagnet
EXPOSE 3333

ENTRYPOINT ["bitmagnet"]
