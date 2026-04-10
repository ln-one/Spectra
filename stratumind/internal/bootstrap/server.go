package bootstrap

import (
	"github.com/ln-one/stratumind/internal/api"
	"github.com/ln-one/stratumind/internal/application"
	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/infrastructure"
)

func NewServer() (*api.Server, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	store := infrastructure.NewQdrantStore(cfg)
	embeddings := infrastructure.NewEmbeddingClient(cfg)
	reranker := infrastructure.NewRerankClient(cfg)
	service := application.NewService(store, embeddings, reranker, cfg.RerankCandidateK)
	return api.NewServer(":"+cfg.Port, service), nil
}
