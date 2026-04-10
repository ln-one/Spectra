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

func TestBuildFilterIncludesProjectSessionAndFileFilters(t *testing.T) {
	filter := buildFilter(
		"project-1",
		"session-1",
		domain.SearchFilters{
			FileTypes: []string{"pdf"},
			FileIDs:   []string{"upload-1"},
		},
	)
	must, ok := filter["must"].([]map[string]any)
	if !ok {
		t.Fatalf("unexpected filter shape: %#v", filter)
	}
	if len(must) != 4 {
		t.Fatalf("expected 4 clauses, got %d", len(must))
	}
}

func TestQdrantStoreSearchTextNormalizesPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/collections/test":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "green"}})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/search":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": []map[string]any{
					{
						"id":    "chunk-1",
						"score": 0.91234,
						"payload": map[string]any{
							"content":      "Hooke's law",
							"project_id":   "project-1",
							"source_scope": "local_project",
							"source_type":  "document",
							"filename":     "physics.pdf",
							"upload_id":    "upload-1",
							"page_number":  3,
							"session_id":   "session-1",
						},
					},
				},
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	results, err := store.SearchText(context.Background(), domain.SearchTextRequest{
		ProjectID: "project-1",
		Query:     "Hooke",
		TopK:      5,
		SessionID: "session-1",
	}, []float64{0.1, 0.2, 0.3})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].ChunkID != "chunk-1" || results[0].Citation.Filename != "physics.pdf" {
		t.Fatalf("unexpected result: %#v", results[0])
	}
}

func TestQdrantStoreGetSourceDetailIncludesContext(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"points": []map[string]any{
						{
							"id": "chunk-2",
							"payload": map[string]any{
								"content":     "middle chunk",
								"project_id":  "project-1",
								"source_type": "document",
								"filename":    "chemistry.pdf",
								"upload_id":   "upload-1",
								"chunk_index": 1,
							},
						},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/scroll":
			callCount++
			content := "next chunk"
			if callCount == 1 {
				content = "previous chunk"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"points": []map[string]any{
						{
							"id": "adjacent",
							"payload": map[string]any{
								"content": content,
							},
						},
					},
				},
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	detail, err := store.GetSourceDetail(context.Background(), "project-1", "chunk-2")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if detail == nil || detail.Context == nil {
		t.Fatalf("expected detail with context, got %#v", detail)
	}
	if detail.Context.PreviousChunk != "previous chunk" || detail.Context.NextChunk != "next chunk" {
		t.Fatalf("unexpected context: %#v", detail.Context)
	}
}

func TestQdrantStoreGetSourceDetailAcceptsDirectPointArray(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": []map[string]any{
					{
						"id": "chunk-2",
						"payload": map[string]any{
							"content":     "middle chunk",
							"project_id":  "project-1",
							"source_type": "document",
							"filename":    "chemistry.pdf",
							"upload_id":   "upload-1",
							"chunk_index": 1,
						},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/scroll":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"points": []map[string]any{},
				},
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	detail, err := store.GetSourceDetail(context.Background(), "project-1", "chunk-2")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if detail == nil || detail.ChunkID != "chunk-2" {
		t.Fatalf("unexpected detail: %#v", detail)
	}
}

func TestQdrantStoreReturnsProjectNotIndexedWhenCollectionMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "not_found"})
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	_, err := store.SearchText(context.Background(), domain.SearchTextRequest{
		ProjectID: "project-1",
		Query:     "Hooke",
		TopK:      5,
	}, []float64{0.1, 0.2, 0.3})
	if err == nil {
		t.Fatal("expected error")
	}
	svcErr, ok := domain.AsServiceError(err)
	if !ok {
		t.Fatalf("expected service error, got %T", err)
	}
	if svcErr.Code != domain.ErrorProjectNotIndexed {
		t.Fatalf("unexpected code: %s", svcErr.Code)
	}
}

func TestQdrantStoreReadyAcceptsPlaintextHealthz(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/healthz" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_, _ = w.Write([]byte("healthz check passed"))
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	if err := store.Ready(context.Background()); err != nil {
		t.Fatalf("expected ready success, got error: %v", err)
	}
}

func TestQdrantStoreDeleteUploadNoopsWhenCollectionMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/collections/test" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": map[string]any{"error": "missing"}})
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	if err := store.DeleteUpload(context.Background(), "project-1", "upload-1"); err != nil {
		t.Fatalf("expected noop delete, got error: %v", err)
	}
}

func TestQdrantStoreEnsureCollectionNoopsWhenCollectionExists(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if r.Method != http.MethodGet || r.URL.Path != "/collections/test" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "green"}})
	}))
	defer server.Close()

	store := NewQdrantStore(&config.Config{
		QdrantURL:          server.URL,
		QdrantCollection:   "test",
		EmbeddingDimension: 3,
		RequestTimeoutSecs: 2,
	})
	if err := store.EnsureCollection(context.Background()); err != nil {
		t.Fatalf("expected ensure success, got error: %v", err)
	}
	if callCount != 1 {
		t.Fatalf("expected one collection lookup, got %d", callCount)
	}
}
