package fcc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/tee-node/pkg/processorutils"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/ingress"
	"github.com/minhleeee123/xrp-payguard/apps/fcc-extension/internal/protocol"
)

type State struct {
	EvaluationCount uint64 `json:"evaluationCount"`
}
type StateResponse struct {
	StateVersion common.Hash `json:"stateVersion"`
	State        State       `json:"state"`
}

type EvaluationPayload struct {
	Request protocol.ActionRequestV1 `json:"request"`
	State   protocol.SpendStateV1    `json:"state"`
}

type Extension struct {
	mu          sync.RWMutex
	Server      *http.Server
	machine     *ingress.Machine
	evaluations uint64
}

func New(extensionPort, signPort int, machine *ingress.Machine) *Extension {
	extension := &Extension{machine: machine}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /state", extension.stateHandler)
	mux.HandleFunc("POST /action", extension.actionHandler)
	extension.Server = &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: mux}
	return extension
}

func (e *Extension) stateHandler(w http.ResponseWriter, _ *http.Request) {
	e.mu.RLock()
	state := StateResponse{StateVersion: teeutils.ToHash(Version), State: State{EvaluationCount: e.evaluations}}
	e.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(state); err != nil {
		http.Error(w, "state unavailable", http.StatusInternalServerError)
	}
}

func (e *Extension) actionHandler(w http.ResponseWriter, r *http.Request) {
	var action teetypes.Action
	if err := json.NewDecoder(r.Body).Decode(&action); err != nil {
		http.Error(w, "decoding action", http.StatusBadRequest)
		return
	}
	dataFixed, err := processorutils.Parse[instruction.DataFixed](action.Data.Message)
	if err != nil {
		http.Error(w, "decoding fixed data", http.StatusBadRequest)
		return
	}
	status, body := e.processAction(action, dataFixed)
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func (e *Extension) processAction(action teetypes.Action, dataFixed *instruction.DataFixed) (int, []byte) {
	if dataFixed.OPType != teeutils.ToHash(OPTypePayGuard) {
		return http.StatusNotImplemented, []byte("unsupported op type")
	}
	switch dataFixed.OPCommand {
	case teeutils.ToHash(OPCommandPing):
		return http.StatusOK, e.result(action, dataFixed, []byte(`{"status":"ok","command":"PING_V1"}`), 1, nil)
	case teeutils.ToHash(OPCommandEvaluate):
		return http.StatusOK, e.processEvaluate(action, dataFixed)
	default:
		return http.StatusNotImplemented, []byte("unsupported op command")
	}
}

func (e *Extension) processEvaluate(action teetypes.Action, dataFixed *instruction.DataFixed) []byte {
	if e.machine == nil {
		return e.result(action, dataFixed, nil, 0, fmt.Errorf("evaluation unavailable: machine is not configured"))
	}
	var payload EvaluationPayload
	decoder := json.NewDecoder(bytes.NewReader(dataFixed.OriginalMessage))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return e.result(action, dataFixed, nil, 0, fmt.Errorf("malformed evaluation payload"))
	}
	evaluation, err := e.machine.Evaluate(payload.Request, payload.State)
	if err != nil {
		return e.result(action, dataFixed, nil, 0, fmt.Errorf("evaluation denied: %w", err))
	}
	data, err := json.Marshal(evaluation)
	if err != nil {
		return e.result(action, dataFixed, nil, 0, fmt.Errorf("encoding evaluation result"))
	}
	e.mu.Lock()
	e.evaluations++
	e.mu.Unlock()
	return e.result(action, dataFixed, data, 1, nil)
}

func (e *Extension) result(action teetypes.Action, dataFixed *instruction.DataFixed, data []byte, status uint8, err error) []byte {
	encodedData := hexutil.Bytes{}
	if data != nil {
		encodedData = hexutil.Bytes(data)
	}
	result := teetypes.ActionResult{ID: action.Data.ID, SubmissionTag: action.Data.SubmissionTag, Version: Version, OPType: dataFixed.OPType, OPCommand: dataFixed.OPCommand, AdditionalResultStatus: hexutil.Bytes{}, Data: encodedData, Status: status}
	if status == 0 {
		result.Log = fmt.Sprintf("error: %v", err)
	} else if status == 1 {
		result.Log = "ok"
	} else {
		result.Log = "pending"
	}
	encoded, _ := json.Marshal(result)
	return encoded
}
