package admission

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestNormalizeProductionOrigin(t *testing.T) {
	valid, err := NormalizeProductionOrigin("https://machine-a.example.com:8443/")
	if err != nil || valid != "https://machine-a.example.com:8443" {
		t.Fatalf("valid production origin rejected: %q %v", valid, err)
	}
	credentialOrigin := (&url.URL{Scheme: "https", Host: "machine.example.com", User: url.UserPassword("user", "pass")}).String()
	for _, value := range []string{
		"http://machine.example.com", credentialOrigin, "https://machine.example.com/info",
		"https://machine.example.com?token=x", "https://machine.example.com#fragment", "https://localhost",
		"https://127.0.0.1", "https://10.0.0.1", "https://[::1]",
	} {
		if _, err := NormalizeProductionOrigin(value); err == nil {
			t.Fatalf("unsafe machine origin accepted: %s", value)
		}
	}
}

func TestFetchInfoIsBoundedStrictAndStatusChecked(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/info" || request.Header.Get("Accept") != "application/json" {
			http.Error(response, "wrong request", http.StatusBadRequest)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		fmt.Fprint(response, `{}`)
	}))
	defer server.Close()
	if _, err := FetchInfo(server.URL, server.Client()); err != nil {
		t.Fatal(err)
	}

	for name, handler := range map[string]http.HandlerFunc{
		"status": func(response http.ResponseWriter, _ *http.Request) {
			http.Error(response, "no", http.StatusServiceUnavailable)
		},
		"unknown":  func(response http.ResponseWriter, _ *http.Request) { fmt.Fprint(response, `{"unexpected":true}`) },
		"trailing": func(response http.ResponseWriter, _ *http.Request) { fmt.Fprint(response, `{} {}`) },
		"oversize": func(response http.ResponseWriter, _ *http.Request) {
			fmt.Fprint(response, strings.Repeat(" ", maxInfoResponseBytes+1))
		},
	} {
		t.Run(name, func(t *testing.T) {
			bad := httptest.NewTLSServer(handler)
			defer bad.Close()
			if _, err := FetchInfo(bad.URL, bad.Client()); err == nil {
				t.Fatal("invalid machine info response was accepted")
			}
		})
	}
}

func TestProductionHTTPClientRejectsInvalidTimeout(t *testing.T) {
	for _, timeout := range []time.Duration{0, -time.Second, 31 * time.Second} {
		if _, err := NewProductionHTTPClient(timeout); err == nil {
			t.Fatalf("invalid timeout %s was accepted", timeout)
		}
	}
}

func TestPublicDialFilterRejectsInternalAddresses(t *testing.T) {
	for _, value := range []string{"127.0.0.1", "10.0.0.1", "169.254.1.1", "224.0.0.1", "::1", "fe80::1", "fd00::1"} {
		if isPublicIP(net.ParseIP(value)) {
			t.Fatalf("internal address passed public dial filter: %s", value)
		}
	}
	for _, value := range []string{"8.8.8.8", "2001:4860:4860::8888"} {
		if !isPublicIP(net.ParseIP(value)) {
			t.Fatalf("public address failed public dial filter: %s", value)
		}
	}
}
