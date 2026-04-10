package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
)

type EmbeddingClient struct {
	baseURL    string
	model      string
	apiKey     string
	httpClient *http.Client
}

const maxEmbeddingBatchSize = 10

type embeddingRequest struct {
	Model string `json:"model"`
	Input any    `json:"input"`
}

type embeddingResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
}

func NewEmbeddingClient(cfg *config.Config) *EmbeddingClient {
	return &EmbeddingClient{
		baseURL: cfg.EmbeddingBaseURL,
		model: cfg.EmbeddingModel,
		apiKey: cfg.DashScopeAPIKey,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.RequestTimeoutSecs * float64(time.Second)),
		},
	}
}

func (c *EmbeddingClient) EmbedTexts(ctx context.Context, texts []string) ([][]float64, error) {
	if len(texts) == 0 {
		return [][]float64{}, nil
	}
	result := make([][]float64, 0, len(texts))
	for start := 0; start < len(texts); start += maxEmbeddingBatchSize {
		end := start + maxEmbeddingBatchSize
		if end > len(texts) {
			end = len(texts)
		}
		vectors, err := c.embedBatch(ctx, texts[start:end])
		if err != nil {
			return nil, err
		}
		result = append(result, vectors...)
	}
	return result, nil
}

func (c *EmbeddingClient) embedBatch(ctx context.Context, texts []string) ([][]float64, error) {
	body, err := json.Marshal(embeddingRequest{
		Model: c.model,
		Input: texts,
	})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "embedding provider unavailable", map[string]any{"reason": err.Error()}, true)
	}
	defer response.Body.Close()
	rawBody := new(bytes.Buffer)
	if _, err := rawBody.ReadFrom(response.Body); err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "embedding provider response read failed", nil, true)
	}
	var payload embeddingResponse
	if err := json.Unmarshal(rawBody.Bytes(), &payload); err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "embedding provider returned invalid JSON", nil, true)
	}
	if response.StatusCode >= 400 {
		return nil, domain.NewError(
			http.StatusBadGateway,
			domain.ErrorUpstreamUnavailable,
			"embedding provider request failed",
			map[string]any{
				"status_code": response.StatusCode,
				"body":        rawBody.String(),
			},
			true,
		)
	}
	if len(payload.Data) != len(texts) {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, fmt.Sprintf("embedding provider returned %d vectors for %d texts", len(payload.Data), len(texts)), nil, true)
	}
	result := make([][]float64, 0, len(payload.Data))
	for _, item := range payload.Data {
		result = append(result, item.Embedding)
	}
	return result, nil
}

func (c *EmbeddingClient) EmbedText(ctx context.Context, text string) ([]float64, error) {
	vectors, err := c.EmbedTexts(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	return vectors[0], nil
}
