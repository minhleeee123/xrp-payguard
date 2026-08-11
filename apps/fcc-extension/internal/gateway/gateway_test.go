package gateway

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRoutesFCCAndPrivateIngressWithoutChangingBodies(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Upstream", "proxy")
		_, _ = io.Copy(writer, request.Body)
	}))
	defer proxy.Close()
	ingress := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Upstream", "ingress")
		_, _ = io.Copy(writer, request.Body)
	}))
	defer ingress.Close()

	handler, err := New(proxy.URL, ingress.URL)
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		method, path, want string
	}{
		{http.MethodGet, "/info", "proxy"},
		{http.MethodPost, "/instruction", "proxy"},
		{http.MethodGet, "/private/health", "ingress"},
		{http.MethodPost, "/private/ingress", "ingress"},
	} {
		request := httptest.NewRequest(test.method, test.path, strings.NewReader("opaque-body"))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if got := response.Header().Get("X-Upstream"); got != test.want {
			t.Fatalf("%s %s routed to %q, want %q", test.method, test.path, got, test.want)
		}
		if response.Body.String() != "opaque-body" {
			t.Fatalf("%s %s changed the body", test.method, test.path)
		}
	}
}

func TestRejectsUnexpectedPrivateRouteAndNonLoopbackUpstream(t *testing.T) {
	handler, err := New("http://127.0.0.1:6664", "http://127.0.0.1:7703")
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/private/unknown", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("unexpected private route returned %d", response.Code)
	}
	if _, err := New("https://public.example", "http://127.0.0.1:7703"); err == nil {
		t.Fatal("public upstream was accepted")
	}
}
