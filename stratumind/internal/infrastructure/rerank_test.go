package infrastructure

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
)

func TestRerankClientReadyChecksCapability(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/health/ready" || r.URL.RawQuery != "capability=rerank" {
			t.Fatalf("unexpected request: %s %s?%s", r.Method, r.URL.Path, r.URL.RawQuery)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"state": "ready"})
	}))
	defer server.Close()

	client := NewRerankClient(&config.Config{
		RerankEnabled:     true,
		RerankBaseURL:     server.URL,
		RerankTimeoutSecs: 2,
	})
	if err := client.Ready(context.Background()); err != nil {
		t.Fatalf("expected ready success, got error: %v", err)
	}
}

func TestRerankClientRerankMapsFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{
				"code":    "rerank_provider_timeout",
				"message": "timeout",
			},
		})
	}))
	defer server.Close()

	client := NewRerankClient(&config.Config{
		RerankEnabled:     true,
		RerankBaseURL:     server.URL,
		RerankTimeoutSecs: 2,
	})
	_, err := client.Rerank(context.Background(), "query", []string{"doc"}, 1)
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
