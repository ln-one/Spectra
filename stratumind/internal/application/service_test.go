package application

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
	"github.com/ln-one/stratumind/internal/infrastructure"
)

func TestCopyMetadataInjectsContent(t *testing.T) {
	input := map[string]any{"filename": "a.pdf"}
	result := copyMetadata(input, "hello")
	if result["content"] != "hello" {
		t.Fatalf("expected content to be injected")
	}
	if input["content"] != nil {
		t.Fatalf("expected original map to stay untouched")
	}
}

func TestValidationErrorShape(t *testing.T) {
	err := domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "bad", nil, false)
	if err.Status != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", err.Status)
	}
	if err.Code != domain.ErrorInvalidFilters {
		t.Fatalf("unexpected code: %s", err.Code)
	}
}

func TestServiceSearchTextAppliesRerank(t *testing.T) {
	qdrant := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/collections/test":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "green"}})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/search":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": []map[string]any{
					{
						"id":    "chunk-1",
						"score": 0.99,
						"payload": map[string]any{
							"content":     "first doc",
							"project_id":  "project-1",
							"source_type": "document",
							"filename":    "a.pdf",
						},
					},
					{
						"id":    "chunk-2",
						"score": 0.88,
						"payload": map[string]any{
							"content":     "second doc",
							"project_id":  "project-1",
							"source_type": "document",
							"filename":    "b.pdf",
						},
					},
				},
			})
		default:
			t.Fatalf("unexpected qdrant request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer qdrant.Close()

	embedding := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"embedding": []float64{0.1, 0.2, 0.3}},
			},
		})
	}))
	defer embedding.Close()

	rerank := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/health/ready":
			_ = json.NewEncoder(w).Encode(map[string]any{"state": "ready"})
		case r.Method == http.MethodPost && r.URL.Path == "/rerank/text":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"provider": "dashscope",
				"model":    "qwen3-vl-rerank",
				"results": []map[string]any{
					{"index": 1, "score": 0.97, "document": "second doc"},
					{"index": 0, "score": 0.55, "document": "first doc"},
				},
			})
		default:
			t.Fatalf("unexpected rerank request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer rerank.Close()

	cfg := &config.Config{
		QdrantURL:          qdrant.URL,
		QdrantCollection:   "test",
		EmbeddingBaseURL:   embedding.URL,
		EmbeddingModel:     "text-embedding-v4",
		EmbeddingDimension: 3,
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
		RerankEnabled:      true,
		RerankBaseURL:      rerank.URL,
		RerankCandidateK:   10,
		RerankTimeoutSecs:  2,
	}
	service := NewService(
		infrastructure.NewQdrantStore(cfg),
		infrastructure.NewEmbeddingClient(cfg),
		infrastructure.NewRerankClient(cfg),
		cfg.RerankCandidateK,
	)

	response, err := service.SearchText(context.Background(), domain.SearchTextRequest{
		ProjectID: "project-1",
		Query:     "hello",
		TopK:      2,
	})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(response.Results) != 2 {
		t.Fatalf("unexpected response: %+v", response)
	}
	if response.Results[0].ChunkID != "chunk-2" || response.Results[0].RankingStage != "rerank" {
		t.Fatalf("unexpected reranked first result: %+v", response.Results[0])
	}
	if response.Results[0].BaseScore != 0.88 || response.Results[0].RerankScore != 0.97 {
		t.Fatalf("unexpected score fields: %+v", response.Results[0])
	}
}
