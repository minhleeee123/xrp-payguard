package gateway

import (
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
)

// New returns a body-opaque router for one co-located FCC machine. The public
// FCC surface remains on the origin root, while only the two authenticated
// private-ingress operations are forwarded to the PayGuard ingress server.
func New(proxyOrigin, ingressOrigin string) (http.Handler, error) {
	proxyURL, err := internalOrigin(proxyOrigin)
	if err != nil {
		return nil, err
	}
	ingressURL, err := internalOrigin(ingressOrigin)
	if err != nil {
		return nil, err
	}

	proxy := reverseProxy(proxyURL)
	ingress := reverseProxy(ingressURL)
	mux := http.NewServeMux()
	mux.Handle("GET /private/health", ingress)
	mux.Handle("POST /private/ingress", ingress)
	mux.HandleFunc("/private/", http.NotFound)
	mux.Handle("/", proxy)
	return mux, nil
}

func internalOrigin(value string) (*url.URL, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "http" || parsed.Hostname() != "127.0.0.1" || parsed.Port() == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return nil, errors.New("gateway upstream must be an explicit loopback HTTP origin")
	}
	return parsed, nil
}

func reverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(writer http.ResponseWriter, _ *http.Request, _ error) {
		http.Error(writer, "FCC endpoint unavailable", http.StatusBadGateway)
	}
	return proxy
}
