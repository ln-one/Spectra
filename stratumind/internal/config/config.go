package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port               string
	QdrantURL          string
	QdrantAPIKey       string
	QdrantCollection   string
	EmbeddingBaseURL   string
	EmbeddingModel     string
	EmbeddingDimension int
	DashScopeAPIKey    string
	RequestTimeoutSecs float64
	RerankEnabled      bool
	RerankBaseURL      string
	RerankCandidateK   int
	RerankTimeoutSecs  float64
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:               getenv("PORT", "8110"),
		QdrantURL:          strings.TrimRight(getenv("QDRANT_URL", "http://qdrant:6333"), "/"),
		QdrantAPIKey:       strings.TrimSpace(os.Getenv("QDRANT_API_KEY")),
		QdrantCollection:   getenv("QDRANT_COLLECTION_TEXT", "stratumind_text_chunks"),
		EmbeddingBaseURL:   strings.TrimRight(getenv("STRATUMIND_EMBEDDING_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"), "/"),
		EmbeddingModel:     getenv("STRATUMIND_EMBEDDING_MODEL", "text-embedding-v4"),
		EmbeddingDimension: getenvInt("STRATUMIND_EMBEDDING_DIMENSION", getenvInt("EMBEDDING_DIMENSION", 1024)),
		DashScopeAPIKey:    strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY")),
		RequestTimeoutSecs: getenvFloat("STRATUMIND_TIMEOUT_SECONDS", 15.0),
		RerankEnabled:      getenvBool("STRATUMIND_RERANK_ENABLED", false),
		RerankBaseURL:      strings.TrimRight(strings.TrimSpace(os.Getenv("STRATUMIND_RERANK_BASE_URL")), "/"),
		RerankCandidateK:   getenvInt("STRATUMIND_RERANK_CANDIDATE_K", 20),
		RerankTimeoutSecs:  getenvFloat("STRATUMIND_RERANK_TIMEOUT_SECONDS", 10.0),
	}
	if cfg.DashScopeAPIKey == "" {
		return nil, fmt.Errorf("DASHSCOPE_API_KEY is required")
	}
	if cfg.QdrantURL == "" {
		return nil, fmt.Errorf("QDRANT_URL is required")
	}
	if cfg.RerankEnabled && cfg.RerankBaseURL == "" {
		return nil, fmt.Errorf("STRATUMIND_RERANK_BASE_URL is required when STRATUMIND_RERANK_ENABLED=true")
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getenvFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func getenvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
