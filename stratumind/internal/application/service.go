package application

import (
	"context"
	"net/http"
	"strings"

	"github.com/ln-one/stratumind/internal/domain"
	"github.com/ln-one/stratumind/internal/infrastructure"
)

type Service struct {
	store      *infrastructure.QdrantStore
	embeddings *infrastructure.EmbeddingClient
	reranker   *infrastructure.RerankClient
	candidateK int
}

func NewService(store *infrastructure.QdrantStore, embeddings *infrastructure.EmbeddingClient, reranker *infrastructure.RerankClient, candidateK int) *Service {
	return &Service{store: store, embeddings: embeddings, reranker: reranker, candidateK: candidateK}
}

func (s *Service) Ready(ctx context.Context) error {
	if err := s.store.Ready(ctx); err != nil {
		return err
	}
	if s.reranker != nil && s.reranker.Enabled() {
		return s.reranker.Ready(ctx)
	}
	return nil
}

func (s *Service) IndexChunks(ctx context.Context, request domain.ChunkIndexRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ProjectID) == "" {
		return nil, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "project_id is required", nil, false)
	}
	if len(request.Chunks) == 0 {
		return map[string]any{"indexed_count": 0}, nil
	}
	texts := make([]string, 0, len(request.Chunks))
	for index := range request.Chunks {
		request.Chunks[index].Metadata = copyMetadata(request.Chunks[index].Metadata, request.Chunks[index].Content)
		texts = append(texts, request.Chunks[index].Content)
	}
	vectors, err := s.embeddings.EmbedTexts(ctx, texts)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpsertChunks(ctx, request.ProjectID, request.Chunks, vectors); err != nil {
		return nil, err
	}
	return map[string]any{"indexed_count": len(request.Chunks)}, nil
}

func (s *Service) SearchText(ctx context.Context, request domain.SearchTextRequest) (*domain.SearchTextResponse, error) {
	if strings.TrimSpace(request.ProjectID) == "" {
		return nil, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "project_id is required", nil, false)
	}
	if strings.TrimSpace(request.Query) == "" {
		return nil, domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "query is required", nil, false)
	}
	queryVector, err := s.embeddings.EmbedText(ctx, request.Query)
	if err != nil {
		return nil, err
	}
	searchRequest := request
	if s.reranker != nil && s.reranker.Enabled() {
		searchRequest.TopK = max(request.TopK, s.candidateK)
	}
	results, err := s.store.SearchText(ctx, searchRequest, queryVector)
	if err != nil {
		return nil, err
	}
	if s.reranker != nil && s.reranker.Enabled() && len(results) > 0 {
		results, err = s.rerankResults(ctx, request, results)
		if err != nil {
			return nil, err
		}
	}
	return &domain.SearchTextResponse{Results: results, Total: len(results)}, nil
}

func (s *Service) GetSourceDetail(ctx context.Context, projectID, chunkID string) (*domain.SourceDetail, error) {
	return s.store.GetSourceDetail(ctx, projectID, chunkID)
}

func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	if strings.TrimSpace(projectID) == "" {
		return domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "project_id is required", nil, false)
	}
	return s.store.DeleteProject(ctx, projectID)
}

func (s *Service) DeleteUpload(ctx context.Context, projectID, uploadID string) error {
	if strings.TrimSpace(projectID) == "" || strings.TrimSpace(uploadID) == "" {
		return domain.NewError(http.StatusBadRequest, domain.ErrorInvalidFilters, "project_id and upload_id are required", nil, false)
	}
	return s.store.DeleteUpload(ctx, projectID, uploadID)
}

func copyMetadata(metadata map[string]any, content string) map[string]any {
	result := map[string]any{}
	for key, value := range metadata {
		result[key] = value
	}
	result["content"] = content
	return result
}

func (s *Service) rerankResults(ctx context.Context, request domain.SearchTextRequest, results []domain.TextRetrievalResult) ([]domain.TextRetrievalResult, error) {
	documents := make([]string, 0, len(results))
	for _, item := range results {
		documents = append(documents, item.Content)
	}
	reranked, err := s.reranker.Rerank(ctx, request.Query, documents, min(max(1, request.TopK), len(documents)))
	if err != nil {
		return nil, err
	}
	reordered := make([]domain.TextRetrievalResult, 0, len(reranked))
	for _, item := range reranked {
		if item.Index < 0 || item.Index >= len(results) {
			continue
		}
		result := results[item.Index]
		result.BaseScore = result.Score
		result.Score = item.Score
		result.RerankScore = item.Score
		result.RankingStage = "rerank"
		reordered = append(reordered, result)
	}
	if len(reordered) == 0 {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank returned no usable results", nil, true)
	}
	return reordered, nil
}
