# Official MinIO sources: public prebuilt images are no longer available.
FROM golang:1.24.8-bookworm AS server-build
WORKDIR /src
RUN git init && git remote add origin https://github.com/minio/minio.git && git fetch --depth 1 origin 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -trimpath -o /out/minio .
FROM golang:1.24.8-bookworm AS client-build
WORKDIR /src
RUN git init && git remote add origin https://github.com/minio/mc.git && git fetch --depth 1 origin 7394ce0dd2a80935aded936b09fa12cbb3cb8096 && git checkout --detach FETCH_HEAD
RUN CGO_ENABLED=0 go build -trimpath -o /out/mc .
FROM debian:bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=server-build /out/minio /usr/local/bin/minio
COPY --from=server-build /src/LICENSE /usr/share/doc/minio/LICENSE
ENTRYPOINT ["minio"]
FROM debian:bookworm-slim AS client
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=client-build /out/mc /usr/local/bin/mc
COPY --from=client-build /src/LICENSE /usr/share/doc/minio-mc/LICENSE
ENTRYPOINT ["mc"]
