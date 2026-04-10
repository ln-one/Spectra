package infrastructure

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
)

func TestEmbeddingClientEmbedTextsSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if r.URL.Path != "/embeddings" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected auth header: %s", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"embedding": []float64{0.1, 0.2}},
				{"embedding": []float64{0.3, 0.4}},
			},
		})
	}))
	defer server.Close()

	client := NewEmbeddingClient(&config.Config{
		EmbeddingBaseURL:   server.URL,
		EmbeddingModel:     "text-embedding-v4",
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
	})

	vectors, err := client.EmbedTexts(context.Background(), []string{"hello", "world"})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(vectors) != 2 || len(vectors[0]) != 2 {
		t.Fatalf("unexpected vector shape: %#v", vectors)
	}
}

func TestEmbeddingClientMapsProviderFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"message": "upstream down"},
		})
	}))
	defer server.Close()

	client := NewEmbeddingClient(&config.Config{
		EmbeddingBaseURL:   server.URL,
		EmbeddingModel:     "text-embedding-v4",
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
	})

	_, err := client.EmbedTexts(context.Background(), []string{"hello"})
	if err == nil {
		t.Fatal("expected error")
	}
	svcErr, ok := domain.AsServiceError(err)
	if !ok {
		t.Fatalf("expected service error, got %T", err)
	}
	if svcErr.Code != domain.ErrorUpstreamUnavailable {
		t.Fatalf("unexpected code: %s", svcErr.Code)
	}
}

func TestEmbeddingClientRejectsInvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("{not-json"))
	}))
	defer server.Close()

	client := NewEmbeddingClient(&config.Config{
		EmbeddingBaseURL:   server.URL,
		EmbeddingModel:     "text-embedding-v4",
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
	})

	_, err := client.EmbedTexts(context.Background(), []string{"hello"})
	if err == nil {
		t.Fatal("expected error")
	}
	svcErr, ok := domain.AsServiceError(err)
	if !ok {
		t.Fatalf("expected service error, got %T", err)
	}
	if svcErr.Code != domain.ErrorUpstreamUnavailable {
		t.Fatalf("unexpected code: %s", svcErr.Code)
	}
}

func TestEmbeddingClientBatchesRequestsAtTen(t *testing.T) {
	var batchSizes []int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		inputs, ok := payload["input"].([]any)
		if !ok {
			t.Fatalf("unexpected input payload: %#v", payload["input"])
		}
		batchSizes = append(batchSizes, len(inputs))
		data := make([]map[string]any, 0, len(inputs))
		for range inputs {
			data = append(data, map[string]any{"embedding": []float64{0.1, 0.2}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
	}))
	defer server.Close()

	client := NewEmbeddingClient(&config.Config{
		EmbeddingBaseURL:   server.URL,
		EmbeddingModel:     "text-embedding-v4",
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
	})

	inputs := make([]string, 19)
	for i := range inputs {
		inputs[i] = "chunk"
	}
	vectors, err := client.EmbedTexts(context.Background(), inputs)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(vectors) != 19 {
		t.Fatalf("unexpected vector count: %d", len(vectors))
	}
	if !slices.Equal(batchSizes, []int{10, 9}) {
		t.Fatalf("unexpected batch sizes: %#v", batchSizes)
	}
}
