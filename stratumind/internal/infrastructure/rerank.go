package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ln-one/stratumind/internal/config"
	"github.com/ln-one/stratumind/internal/domain"
)

type RerankClient struct {
	baseURL    string
	httpClient *http.Client
	enabled    bool
}

type rerankRequest struct {
	Query           string   `json:"query"`
	Documents       []string `json:"documents"`
	TopN            int      `json:"top_n,omitempty"`
	ReturnDocuments bool     `json:"return_documents,omitempty"`
}

type rerankResponse struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Results  []struct {
		Index    int     `json:"index"`
		Score    float64 `json:"score"`
		Document string  `json:"document,omitempty"`
	} `json:"results"`
}

type RerankResult struct {
	Index    int
	Score    float64
	Document string
}

func NewRerankClient(cfg *config.Config) *RerankClient {
	return &RerankClient{
		baseURL: strings.TrimRight(cfg.RerankBaseURL, "/"),
		enabled: cfg.RerankEnabled,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.RerankTimeoutSecs * float64(time.Second)),
		},
	}
}

func (c *RerankClient) Enabled() bool {
	return c != nil && c.enabled
}

func (c *RerankClient) Ready(ctx context.Context) error {
	if !c.Enabled() {
		return nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health/ready?capability=rerank", nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank service unavailable", map[string]any{"reason": err.Error()}, true)
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		rawBody, _ := io.ReadAll(response.Body)
		return domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank service not ready", map[string]any{"status_code": response.StatusCode, "body": string(rawBody)}, true)
	}
	return nil
}

func (c *RerankClient) Rerank(ctx context.Context, query string, documents []string, topN int) ([]RerankResult, error) {
	if !c.Enabled() {
		return nil, nil
	}
	body, err := json.Marshal(rerankRequest{
		Query:           query,
		Documents:       documents,
		TopN:            topN,
		ReturnDocuments: true,
	})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rerank/text", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank request failed", map[string]any{"reason": err.Error()}, true)
	}
	defer response.Body.Close()
	rawBody, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "failed to read rerank response", nil, true)
	}
	if response.StatusCode >= 400 {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank request failed", map[string]any{"status_code": response.StatusCode, "body": string(rawBody)}, true)
	}
	var payload rerankResponse
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, "rerank returned invalid JSON", map[string]any{"body": string(rawBody)}, true)
	}
	results := make([]RerankResult, 0, len(payload.Results))
	for _, item := range payload.Results {
		results = append(results, RerankResult{
			Index:    item.Index,
			Score:    item.Score,
			Document: item.Document,
		})
	}
	if len(results) == 0 && len(documents) > 0 {
		return nil, domain.NewError(http.StatusBadGateway, domain.ErrorUpstreamUnavailable, fmt.Sprintf("rerank returned 0 results for %d documents", len(documents)), nil, true)
	}
	return results, nil
}
