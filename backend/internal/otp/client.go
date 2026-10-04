// Package otp is a client for the GTFS GraphQL API of OpenTripPlanner 2.
package otp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const graphQLPath = "/otp/gtfs/v1"

type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// FeedIDs returns the IDs of the transit feeds loaded into the OTP graph.
func (c *Client) FeedIDs(ctx context.Context) ([]string, error) {
	var data struct {
		Feeds []struct {
			FeedID string `json:"feedId"`
		} `json:"feeds"`
	}
	if err := c.query(ctx, `{ feeds { feedId } }`, &data); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(data.Feeds))
	for _, f := range data.Feeds {
		ids = append(ids, f.FeedID)
	}
	return ids, nil
}

func (c *Client) query(ctx context.Context, query string, out any) error {
	body, err := json.Marshal(map[string]string{"query": query})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+graphQLPath, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("otp: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("otp: unexpected status %s", resp.Status)
	}

	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("otp: decode response: %w", err)
	}
	if len(envelope.Errors) > 0 {
		return errors.New("otp: " + envelope.Errors[0].Message)
	}
	return json.Unmarshal(envelope.Data, out)
}
