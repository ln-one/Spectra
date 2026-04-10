package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/ln-one/stratumind/internal/application"
	"github.com/ln-one/stratumind/internal/domain"
)

type Server struct {
	httpServer *http.Server
}

func NewServer(addr string, service *application.Service) *Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
			return
		}
		if err := service.Ready(r.Context()); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"state": "ready"})
	})
	mux.HandleFunc("/indexes/chunks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
			return
		}
		var request domain.ChunkIndexRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "invalid JSON payload", nil, false))
			return
		}
		response, err := service.IndexChunks(r.Context(), request)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	mux.HandleFunc("/search/text", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
			return
		}
		var request domain.SearchTextRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "invalid JSON payload", nil, false))
			return
		}
		response, err := service.SearchText(r.Context(), request)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	mux.HandleFunc("/sources/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
			return
		}
		chunkID := strings.TrimPrefix(r.URL.Path, "/sources/")
		projectID := strings.TrimSpace(r.URL.Query().Get("project_id"))
		response, err := service.GetSourceDetail(r.Context(), projectID, chunkID)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	})
	mux.HandleFunc("/indexes/projects/", func(w http.ResponseWriter, r *http.Request) {
		projectID := strings.TrimPrefix(r.URL.Path, "/indexes/projects/")
		if projectID == "" {
			writeError(w, domain.NewError(http.StatusNotFound, domain.ErrorNotFound, "resource not found", nil, false))
			return
		}
		parts := strings.Split(projectID, "/")
		if len(parts) == 1 {
			if r.Method != http.MethodDelete {
				writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
				return
			}
			if err := service.DeleteProject(r.Context(), parts[0]); err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
			return
		}
		if len(parts) == 3 && parts[1] == "uploads" {
			if r.Method != http.MethodDelete {
				writeError(w, domain.NewError(http.StatusMethodNotAllowed, domain.ErrorUnsupportedMode, "method not allowed", nil, false))
				return
			}
			if err := service.DeleteUpload(r.Context(), parts[0], parts[2]); err != nil {
				writeError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
			return
		}
		writeError(w, domain.NewError(http.StatusNotFound, domain.ErrorNotFound, "resource not found", nil, false))
	})
	return &Server{
		httpServer: &http.Server{
			Addr:              addr,
			Handler:           timeoutMiddleware(20*time.Second, mux),
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
}

func (s *Server) ListenAndServe() error {
	return s.httpServer.ListenAndServe()
}

func timeoutMiddleware(timeout time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, err error) {
	if svcErr, ok := domain.AsServiceError(err); ok {
		writeJSON(w, svcErr.Status, map[string]any{
			"error": map[string]any{
				"code": svcErr.Code,
				"message": svcErr.Message,
				"details": svcErr.Details,
				"retryable": svcErr.Retryable,
			},
		})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]any{
		"error": map[string]any{
			"code": domain.ErrorStoreUnavailable,
			"message": err.Error(),
		},
	})
}
