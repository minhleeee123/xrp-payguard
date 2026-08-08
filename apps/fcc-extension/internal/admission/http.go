package admission

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

const maxInfoResponseBytes = 256 * 1024

func NormalizeProductionOrigin(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("machine URL must be a credential-free HTTPS origin")
	}
	if parsed.Hostname() == "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("machine URL must not contain a path")
	}
	hostname := strings.ToLower(parsed.Hostname())
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") {
		return "", errors.New("machine URL must not use a loopback host")
	}
	if ip := net.ParseIP(hostname); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast()) {
		return "", errors.New("machine URL must not use a non-public IP address")
	}
	parsed.Path = ""
	return strings.TrimSuffix(parsed.String(), "/"), nil
}

func NewProductionHTTPClient(timeout time.Duration) (*http.Client, error) {
	if timeout <= 0 || timeout > 30*time.Second {
		return nil, errors.New("machine request timeout must be between zero and 30 seconds")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.ResponseHeaderTimeout = timeout
	transport.DialContext = dialPublicContext
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("machine info redirects are forbidden")
		},
	}, nil
}

func dialPublicContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("split machine address: %w", err)
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("resolve machine host: %w", err)
	}
	if len(addresses) == 0 {
		return nil, errors.New("machine host did not resolve")
	}
	for _, resolved := range addresses {
		if !isPublicIP(resolved.IP) {
			return nil, errors.New("machine host resolves to a non-public IP address")
		}
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return dialer.DialContext(ctx, network, net.JoinHostPort(addresses[0].IP.String(), port))
}

func isPublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() && !ip.IsUnspecified() &&
		!ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() && !ip.IsMulticast()
}

func FetchInfo(origin string, client *http.Client) (*teetypes.SignedTeeInfoResponse, error) {
	if client == nil {
		return nil, errors.New("machine HTTP client is required")
	}
	request, err := http.NewRequest(http.MethodGet, origin+"/info", nil)
	if err != nil {
		return nil, fmt.Errorf("build machine info request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch machine info: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("machine info returned status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxInfoResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read machine info: %w", err)
	}
	if len(body) > maxInfoResponseBytes {
		return nil, errors.New("machine info response exceeds size limit")
	}
	var info teetypes.SignedTeeInfoResponse
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&info); err != nil {
		return nil, fmt.Errorf("decode machine info: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, errors.New("machine info contains trailing data")
	}
	return &info, nil
}
