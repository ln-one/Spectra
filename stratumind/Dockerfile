FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/stratumind ./cmd/stratumind

FROM alpine:3.20
RUN adduser -D -u 10001 appuser
USER appuser
WORKDIR /app
COPY --from=builder /bin/stratumind /usr/local/bin/stratumind
ENV PORT=8110
EXPOSE 8110
ENTRYPOINT ["/usr/local/bin/stratumind"]
