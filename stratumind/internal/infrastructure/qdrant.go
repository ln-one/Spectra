package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
)

type QdrantStore struct {
	baseURL      string
	apiKey       string
	collection   string
	dimension    int
	httpClient   *http.Client
}

type qdrantPoint struct {
	ID      string         `json:"id"`
	Vector  []float64      `json:"vector"`
	Payload map[string]any `json:"payload"`
}

type qdrantSearchPoint struct {
	ID      any            `json:"id"`
	Score   float64        `json:"score"`
	Payload map[string]any `json:"payload"`
}

type qdrantResponse struct {
	Result json.RawMessage `json:"result"`
	Status string          `json:"status"`
}

func NewQdrantStore(cfg *config.Config) *QdrantStore {
	return &QdrantStore{
		baseURL: cfg.QdrantURL,
		apiKey: cfg.QdrantAPIKey,
		collection: cfg.QdrantCollection,
		dimension: cfg.EmbeddingDimension,
		httpClient: &http.Client{Timeout: time.Duration(cfg.RequestTimeoutSecs * float64(time.Second))},
	}
}

func (s *QdrantStore) EnsureCollection(ctx context.Context) error {
	if ok, err := s.collectionExists(ctx); err != nil {
		return err
	} else if ok {
		return nil
	}
	body := map[string]any{
		"vectors": map[string]any{
			"size": s.dimension,
			"distance": "Cosine",
		},
	}
	_, err := s.request(ctx, http.MethodPut, "/collections/"+s.collection, body)
	return err
}

func (s *QdrantStore) UpsertChunks(ctx context.Context, projectID string, chunks []domain.ChunkInput, vectors [][]float64) error {
	if err := s.EnsureCollection(ctx); err != nil {
		return err
	}
	points := make([]qdrantPoint, 0, len(chunks))
	for index, chunk := range chunks {
		payload := copyMap(chunk.Metadata)
		payload["project_id"] = projectID
		points = append(points, qdrantPoint{
			ID: chunk.ChunkID,
			Vector: vectors[index],
			Payload: payload,
		})
	}
	_, err := s.request(ctx, http.MethodPut, "/collections/"+s.collection+"/points?wait=true", map[string]any{"points": points})
	return err
}

func (s *QdrantStore) SearchText(ctx context.Context, request domain.SearchTextRequest, queryVector []float64) ([]domain.TextRetrievalResult, error) {
	if ok, err := s.collectionExists(ctx); err != nil {
		return nil, err
	} else if !ok {
		return nil, domain.NewError(http.StatusNotFound, domain.ErrorProjectNotIndexed, "project index does not exist", map[string]any{"project_id": request.ProjectID}, false)
	}
	body := map[string]any{
		"vector": queryVector,
		"limit": max(1, request.TopK),
		"with_payload": true,
		"with_vector": false,
		"filter": buildFilter(request.ProjectID, request.SessionID, request.Filters),
	}
	raw, err := s.request(ctx, http.MethodPost, "/collections/"+s.collection+"/points/search", body)
	if err != nil {
		return nil, err
	}
	var points []qdrantSearchPoint
	if err := json.Unmarshal(raw, &points); err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant search returned invalid payload", nil, true)
	}
	results := make([]domain.TextRetrievalResult, 0, len(points))
	for _, point := range points {
		payload := point.Payload
		chunkID := fmt.Sprintf("%v", point.ID)
		content := stringValue(payload["content"])
		projectID := stringValue(payload["project_id"])
		sourceType := stringValue(payload["source_type"])
		filename := stringValue(payload["filename"])
		fileID := stringValue(payload["upload_id"])
		sourceScope := stringValue(payload["source_scope"])
		sessionID := stringValue(payload["session_id"])
		pageNumber := intPtr(payload["page_number"])
		results = append(results, domain.TextRetrievalResult{
			ChunkID: chunkID,
			Content: content,
			Score: round(point.Score, 4),
			ProjectID: projectID,
			SourceScope: sourceScope,
			SourceType: sourceType,
			Filename: filename,
			FileID: fileID,
			PageNumber: pageNumber,
			SessionID: sessionID,
			Metadata: payload,
			Citation: domain.Citation{
				ChunkID: chunkID,
				SourceType: sourceType,
				Filename: filename,
				PageNumber: pageNumber,
			},
		})
	}
	return results, nil
}

func (s *QdrantStore) GetSourceDetail(ctx context.Context, projectID, chunkID string) (*domain.SourceDetail, error) {
	if projectID == "" {
		return nil, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "project_id is required", nil, false)
	}
	raw, err := s.request(ctx, http.MethodPost, "/collections/"+s.collection+"/points", map[string]any{
		"ids": []string{chunkID},
		"with_payload": true,
		"with_vector": false,
	})
	if err != nil {
		return nil, err
	}
	points, err := decodePointList(raw)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant source lookup returned invalid payload", nil, true)
	}
	for _, point := range points {
		payload := point.Payload
		if stringValue(payload["project_id"]) != projectID {
			continue
		}
		uploadID := stringValue(payload["upload_id"])
		chunkIndex := intValue(payload["chunk_index"])
		detail := &domain.SourceDetail{
			ChunkID: chunkID,
			Content: stringValue(payload["content"]),
			ProjectID: projectID,
			SourceType: stringValue(payload["source_type"]),
			Filename: stringValue(payload["filename"]),
			FileID: uploadID,
			PageNumber: intPtr(payload["page_number"]),
			SessionID: stringValue(payload["session_id"]),
			Metadata: payload,
		}
		if uploadID != "" && chunkIndex >= 0 {
			contextValue, contextErr := s.lookupContext(ctx, projectID, uploadID, chunkIndex)
			if contextErr == nil {
				detail.Context = contextValue
			}
		}
		return detail, nil
	}
	return nil, domain.NewError(http.StatusNotFound, domain.ErrorNotFound, "chunk not found", map[string]any{"chunk_id": chunkID, "project_id": projectID}, false)
}

func (s *QdrantStore) DeleteProject(ctx context.Context, projectID string) error {
	if ok, err := s.collectionExists(ctx); err != nil {
		return err
	} else if !ok {
		return nil
	}
	_, err := s.request(ctx, http.MethodPost, "/collections/"+s.collection+"/points/delete?wait=true", map[string]any{
		"filter": map[string]any{"must": []map[string]any{{"key": "project_id", "match": map[string]any{"value": projectID}}}},
	})
	return err
}

func (s *QdrantStore) DeleteUpload(ctx context.Context, projectID string, uploadID string) error {
	if ok, err := s.collectionExists(ctx); err != nil {
		return err
	} else if !ok {
		return nil
	}
	_, err := s.request(ctx, http.MethodPost, "/collections/"+s.collection+"/points/delete?wait=true", map[string]any{
		"filter": map[string]any{"must": []map[string]any{
			{"key": "project_id", "match": map[string]any{"value": projectID}},
			{"key": "upload_id", "match": map[string]any{"value": uploadID}},
		}},
	})
	return err
}

func (s *QdrantStore) Ready(ctx context.Context) error {
	_, err := s.request(ctx, http.MethodGet, "/healthz", nil)
	return err
}

func (s *QdrantStore) lookupContext(ctx context.Context, projectID, uploadID string, chunkIndex int) (*domain.ChunkContext, error) {
	prev, _ := s.lookupAdjacentChunk(ctx, projectID, uploadID, chunkIndex-1)
	next, _ := s.lookupAdjacentChunk(ctx, projectID, uploadID, chunkIndex+1)
	if prev == "" && next == "" {
		return nil, nil
	}
	return &domain.ChunkContext{PreviousChunk: prev, NextChunk: next}, nil
}

func (s *QdrantStore) lookupAdjacentChunk(ctx context.Context, projectID, uploadID string, chunkIndex int) (string, error) {
	if chunkIndex < 0 {
		return "", nil
	}
	raw, err := s.request(ctx, http.MethodPost, "/collections/"+s.collection+"/points/scroll", map[string]any{
		"limit": 1,
		"with_payload": true,
		"with_vector": false,
		"filter": map[string]any{"must": []map[string]any{
			{"key": "project_id", "match": map[string]any{"value": projectID}},
			{"key": "upload_id", "match": map[string]any{"value": uploadID}},
			{"key": "chunk_index", "match": map[string]any{"value": chunkIndex}},
		}},
	})
	if err != nil {
		return "", err
	}
	var payload struct {
		Points []qdrantSearchPoint `json:"points"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", err
	}
	if len(payload.Points) == 0 {
		return "", nil
	}
	return stringValue(payload.Points[0].Payload["content"]), nil
}

func decodePointList(raw json.RawMessage) ([]qdrantSearchPoint, error) {
	var direct []qdrantSearchPoint
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct, nil
	}
	var wrapped struct {
		Points []qdrantSearchPoint `json:"points"`
	}
	if err := json.Unmarshal(raw, &wrapped); err != nil {
		return nil, err
	}
	return wrapped.Points, nil
}

func (s *QdrantStore) collectionExists(ctx context.Context) (bool, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/collections/"+s.collection, nil)
	if err != nil {
		return false, err
	}
	if s.apiKey != "" {
		request.Header.Set("api-key", s.apiKey)
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return false, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant unavailable", map[string]any{"reason": err.Error()}, true)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return false, nil
	}
	if response.StatusCode >= 400 {
		return false, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant collection lookup failed", map[string]any{"status_code": response.StatusCode}, true)
	}
	return true, nil
}

func (s *QdrantStore) request(ctx context.Context, method, path string, body any) (json.RawMessage, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(ctx, method, s.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if s.apiKey != "" {
		request.Header.Set("api-key", s.apiKey)
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant unavailable", map[string]any{"reason": err.Error()}, true)
	}
	defer response.Body.Close()
	rawBody, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "failed to read qdrant response", nil, true)
	}
	if response.StatusCode >= 400 {
		return nil, domain.NewError(
			http.StatusBadGateway,
			domain.ErrorStoreUnavailable,
			"qdrant request failed",
			map[string]any{
				"status_code": response.StatusCode,
				"path":        path,
				"body":        string(rawBody),
			},
			true,
		)
	}
	if response.StatusCode < 400 && method == http.MethodGet && path == "/healthz" {
		return json.RawMessage(`null`), nil
	}
	var payload qdrantResponse
	if len(rawBody) > 0 {
		if err := json.Unmarshal(rawBody, &payload); err != nil {
			return nil, domain.NewError(http.StatusBadGateway, domain.ErrorStoreUnavailable, "qdrant returned invalid JSON", map[string]any{"body": string(rawBody)}, true)
		}
	}
	if payload.Result == nil {
		return json.RawMessage(`null`), nil
	}
	return payload.Result, nil
}

func buildFilter(projectID, sessionID string, filters domain.SearchFilters) map[string]any {
	must := []map[string]any{
		{"key": "project_id", "match": map[string]any{"value": projectID}},
	}
	if sessionID != "" {
		must = append(must, map[string]any{"key": "session_id", "match": map[string]any{"value": sessionID}})
	}
	if len(filters.FileTypes) > 0 {
		anyValues := make([]any, 0, len(filters.FileTypes))
		for _, item := range filters.FileTypes {
			anyValues = append(anyValues, item)
		}
		must = append(must, map[string]any{"key": "source_type", "match": map[string]any{"any": anyValues}})
	}
	if len(filters.FileIDs) > 0 {
		anyValues := make([]any, 0, len(filters.FileIDs))
		for _, item := range filters.FileIDs {
			anyValues = append(anyValues, item)
		}
		must = append(must, map[string]any{"key": "upload_id", "match": map[string]any{"any": anyValues}})
	}
	return map[string]any{"must": must}
}

func copyMap(input map[string]any) map[string]any {
	result := map[string]any{}
	for key, value := range input {
		result[key] = value
	}
	return result
}

func intPtr(value any) *int {
	parsed := intValue(value)
	if parsed < 0 {
		return nil
	}
	return &parsed
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	case string:
		parsed, err := strconv.Atoi(typed)
		if err == nil {
			return parsed
		}
	}
	return -1
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%v", value)
}

func round(value float64, places int) float64 {
	factor := math.Pow(10, float64(places))
	return math.Round(value*factor) / factor
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
