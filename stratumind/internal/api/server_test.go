package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ln-one/stratumind/internal/application"
	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/infrastructure"
)

func newTestService(t *testing.T) (*application.Service, func()) {
	t.Helper()

	qdrant := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/healthz":
			_, _ = w.Write([]byte("healthz check passed"))
		case r.Method == http.MethodPut && r.URL.Path == "/collections/test":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": true})
		case r.Method == http.MethodGet && r.URL.Path == "/collections/test":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "green"}})
		case r.Method == http.MethodPut && r.URL.Path == "/collections/test/points":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "ack"}})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/search":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": []map[string]any{
					{
						"id":    "chunk-1",
						"score": 0.98,
						"payload": map[string]any{
							"content":      "retrieved content",
							"project_id":   "project-1",
							"source_scope": "local_project",
							"source_type":  "document",
							"filename":     "source.pdf",
							"upload_id":    "upload-1",
							"chunk_index":  0,
						},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"points": []map[string]any{
						{
							"id": "chunk-1",
							"payload": map[string]any{
								"content":     "retrieved content",
								"project_id":  "project-1",
								"source_type": "document",
								"filename":    "source.pdf",
								"upload_id":   "upload-1",
								"chunk_index": 0,
							},
						},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/scroll":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"result": map[string]any{
					"points": []map[string]any{
						{
							"id": "adjacent",
							"payload": map[string]any{
								"content": "neighbor chunk",
							},
						},
					},
				},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/collections/test/points/delete":
			_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"status": "ack"}})
		default:
			t.Fatalf("unexpected qdrant request: %s %s", r.Method, r.URL.Path)
		}
	}))

	embedding := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{"embedding": []float64{0.1, 0.2, 0.3}},
			},
		})
	}))

	cfg := &config.Config{
		QdrantURL:          qdrant.URL,
		QdrantCollection:   "test",
		EmbeddingBaseURL:   embedding.URL,
		EmbeddingModel:     "text-embedding-v4",
		EmbeddingDimension: 3,
		DashScopeAPIKey:    "test-key",
		RequestTimeoutSecs: 2,
	}
	service := application.NewService(
		infrastructure.NewQdrantStore(cfg),
		infrastructure.NewEmbeddingClient(cfg),
		infrastructure.NewRerankClient(cfg),
		cfg.RerankCandidateK,
	)
	cleanup := func() {
		qdrant.Close()
		embedding.Close()
	}
	return service, cleanup
}

func TestServerEndpoints(t *testing.T) {
	service, cleanup := newTestService(t)
	defer cleanup()

	server := NewServer(":0", service)
	ts := httptest.NewServer(server.httpServer.Handler)
	defer ts.Close()

	requests := []struct {
		name       string
		method     string
		path       string
		body       map[string]any
		statusCode int
		assert     func(t *testing.T, payload map[string]any)
	}{
		{
			name:       "ready",
			method:     http.MethodGet,
			path:       "/health/ready",
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if payload["state"] != "ready" {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
		{
			name:   "index",
			method: http.MethodPost,
			path:   "/indexes/chunks",
			body: map[string]any{
				"project_id": "project-1",
				"chunks": []map[string]any{
					{
						"chunk_id": "chunk-1",
						"content":  "hello",
						"metadata": map[string]any{"filename": "source.pdf"},
					},
				},
			},
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if int(payload["indexed_count"].(float64)) != 1 {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
		{
			name:   "search",
			method: http.MethodPost,
			path:   "/search/text",
			body: map[string]any{
				"project_id": "project-1",
				"query":      "hello",
				"top_k":      5,
			},
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if int(payload["total"].(float64)) != 1 {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
		{
			name:       "source detail",
			method:     http.MethodGet,
			path:       "/sources/chunk-1?project_id=project-1",
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if payload["chunk_id"] != "chunk-1" {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
		{
			name:       "delete project",
			method:     http.MethodDelete,
			path:       "/indexes/projects/project-1",
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if payload["deleted"] != true {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
		{
			name:       "delete upload",
			method:     http.MethodDelete,
			path:       "/indexes/projects/project-1/uploads/upload-1",
			statusCode: http.StatusOK,
			assert: func(t *testing.T, payload map[string]any) {
				if payload["deleted"] != true {
					t.Fatalf("unexpected payload: %#v", payload)
				}
			},
		},
	}

	for _, tc := range requests {
		t.Run(tc.name, func(t *testing.T) {
			var body io.Reader
			if tc.body != nil {
				raw, err := json.Marshal(tc.body)
				if err != nil {
					t.Fatalf("marshal request: %v", err)
				}
				body = bytes.NewReader(raw)
			}
			req, err := http.NewRequest(tc.method, ts.URL+tc.path, body)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			if tc.body != nil {
				req.Header.Set("Content-Type", "application/json")
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.statusCode {
				t.Fatalf("unexpected status: %d", resp.StatusCode)
			}
			var payload map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			tc.assert(t, payload)
		})
	}
}
