package domain

import "errors"

type ErrorCode string

const (
	ErrorIndexNotReady       ErrorCode = "INDEX_NOT_READY"
	ErrorProjectNotIndexed   ErrorCode = "PROJECT_NOT_INDEXED"
	ErrorQueryTimeout        ErrorCode = "QUERY_TIMEOUT"
	ErrorInvalidFilters      ErrorCode = "INVALID_FILTERS"
	ErrorUnsupportedMode     ErrorCode = "UNSUPPORTED_RETRIEVAL_MODE"
	ErrorStoreUnavailable    ErrorCode = "STORE_UNAVAILABLE"
	ErrorUpstreamUnavailable ErrorCode = "UPSTREAM_UNAVAILABLE"
	ErrorUpstreamConfig      ErrorCode = "UPSTREAM_CONFIG_ERROR"
	ErrorNotFound            ErrorCode = "NOT_FOUND"
)

type ServiceError struct {
	Code      ErrorCode      `json:"code"`
	Message   string         `json:"message"`
	Details   map[string]any `json:"details,omitempty"`
	Retryable bool           `json:"retryable,omitempty"`
	Status    int            `json:"-"`
}

func (e *ServiceError) Error() string {
	return e.Message
}

func NewError(status int, code ErrorCode, message string, details map[string]any, retryable bool) *ServiceError {
	return &ServiceError{
		Code:      code,
		Message:   message,
		Details:   details,
		Retryable: retryable,
		Status:    status,
	}
}

func AsServiceError(err error) (*ServiceError, bool) {
	var svcErr *ServiceError
	if errors.As(err, &svcErr) {
		return svcErr, true
	}
	return nil, false
}

type ChunkInput struct {
	ChunkID  string         `json:"chunk_id"`
	Content  string         `json:"content"`
	Metadata map[string]any `json:"metadata"`
}

type ChunkIndexRequest struct {
	ProjectID string       `json:"project_id"`
	Chunks    []ChunkInput `json:"chunks"`
}

type SearchFilters struct {
	FileTypes []string `json:"file_types,omitempty"`
	FileIDs   []string `json:"file_ids,omitempty"`
}

type SearchTextRequest struct {
	ProjectID string        `json:"project_id"`
	Query     string        `json:"query"`
	TopK      int           `json:"top_k"`
	SessionID string        `json:"session_id,omitempty"`
	Filters   SearchFilters `json:"filters,omitempty"`
}

type Citation struct {
	ChunkID    string `json:"chunk_id"`
	SourceType string `json:"source_type"`
	Filename   string `json:"filename"`
	PageNumber *int   `json:"page_number,omitempty"`
}

type TextRetrievalResult struct {
	ChunkID      string         `json:"chunk_id"`
	Content      string         `json:"content"`
	Score        float64        `json:"score"`
	BaseScore    float64        `json:"base_score,omitempty"`
	RerankScore  float64        `json:"rerank_score,omitempty"`
	RankingStage string         `json:"ranking_stage,omitempty"`
	ProjectID    string         `json:"project_id"`
	SourceScope  string         `json:"source_scope,omitempty"`
	SourceType   string         `json:"source_type"`
	Filename     string         `json:"filename"`
	FileID       string         `json:"file_id,omitempty"`
	PageNumber   *int           `json:"page_number,omitempty"`
	SessionID    string         `json:"session_id,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
	Citation     Citation       `json:"citation"`
}

type SearchTextResponse struct {
	Results []TextRetrievalResult `json:"results"`
	Total   int                   `json:"total"`
}

type ChunkContext struct {
	PreviousChunk string `json:"previous_chunk,omitempty"`
	NextChunk     string `json:"next_chunk,omitempty"`
}

type SourceDetail struct {
	ChunkID    string         `json:"chunk_id"`
	Content    string         `json:"content"`
	ProjectID  string         `json:"project_id"`
	SourceType string         `json:"source_type"`
	Filename   string         `json:"filename"`
	FileID     string         `json:"file_id,omitempty"`
	PageNumber *int           `json:"page_number,omitempty"`
	SessionID  string         `json:"session_id,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	Context    *ChunkContext  `json:"context,omitempty"`
}
