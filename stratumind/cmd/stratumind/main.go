package main

import (
	"log"

	"github.com/ln-one/stratumind/internal/bootstrap"
)

func main() {
	server, err := bootstrap.NewServer()
	if err != nil {
		log.Fatalf("bootstrap_failed: %v", err)
	}
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("server_failed: %v", err)
	}
}
