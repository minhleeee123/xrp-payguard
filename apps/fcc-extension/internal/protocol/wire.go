package protocol

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"strconv"

	"github.com/ethereum/go-ethereum/common"
)

type actionRequestWireV1 struct {
	ChainID           string         `json:"chainId"`
	Registry          common.Address `json:"registry"`
	Vault             common.Address `json:"vault"`
	Router            common.Address `json:"router"`
	PolicyID          common.Hash    `json:"policyId"`
	PolicyVersion     uint32         `json:"policyVersion"`
	PolicyCommitment  common.Hash    `json:"policyCommitment"`
	RequestID         common.Hash    `json:"requestId"`
	RequestNonce      string         `json:"requestNonce"`
	Attempt           uint32         `json:"attempt"`
	Requester         common.Address `json:"requester"`
	Target            common.Address `json:"target"`
	Asset             common.Address `json:"asset"`
	ActionType        common.Hash    `json:"actionType"`
	Amount            string         `json:"amount"`
	ScheduleSlot      string         `json:"scheduleSlot"`
	Occurrence        uint32         `json:"occurrence"`
	SpendCheckpoint   common.Hash    `json:"spendCheckpoint"`
	BalanceCheckpoint common.Hash    `json:"balanceCheckpoint"`
	InputCommitment   common.Hash    `json:"inputCommitment"`
	CreatedAt         string         `json:"createdAt"`
	GraceDeadline     string         `json:"graceDeadline"`
	Expiry            string         `json:"expiry"`
}

type policyWireV1 struct {
	SchemaVersion        uint16           `json:"schemaVersion"`
	ChainID              string           `json:"chainId"`
	Registry             common.Address   `json:"registry"`
	Vault                common.Address   `json:"vault"`
	Router               common.Address   `json:"router"`
	Owner                common.Address   `json:"owner"`
	PolicyID             common.Hash      `json:"policyId"`
	PolicyVersion        uint32           `json:"policyVersion"`
	Asset                common.Address   `json:"asset"`
	ReferenceCurrency    common.Hash      `json:"referenceCurrency"`
	MaxPerAction         string           `json:"maxPerAction"`
	DailyCap             string           `json:"dailyCap"`
	RollingCap           string           `json:"rollingCap"`
	RollingWindowSecs    string           `json:"rollingWindowSeconds"`
	StartAt              string           `json:"startAt"`
	EndAt                string           `json:"endAt"`
	ScheduleIntervalSecs string           `json:"scheduleIntervalSeconds"`
	ScheduleGraceSecs    string           `json:"scheduleGraceSeconds"`
	CooldownSecs         string           `json:"cooldownSeconds"`
	MaxOccurrences       uint32           `json:"maxOccurrences"`
	AllowTargets         []common.Address `json:"allowTargets"`
	DenyTargets          []common.Address `json:"denyTargets"`
	AllowRequesters      []common.Address `json:"allowRequesters"`
	AllowActionTypes     []common.Hash    `json:"allowActionTypes"`
	RequireFTSO          bool             `json:"requireFtso"`
	FTSOFeedID           common.Hash      `json:"ftsoFeedId"`
	MaxPriceAgeSecs      string           `json:"maxPriceAgeSeconds"`
	PrivateSalt          common.Hash      `json:"privateSalt"`
	SubmissionNonce      common.Hash      `json:"submissionNonce"`
}

type policyBindingWireV1 struct {
	ChainID          string         `json:"chainId"`
	Registry         common.Address `json:"registry"`
	Vault            common.Address `json:"vault"`
	Router           common.Address `json:"router"`
	Owner            common.Address `json:"owner"`
	PolicyID         common.Hash    `json:"policyId"`
	PolicyVersion    uint32         `json:"policyVersion"`
	PolicyCommitment common.Hash    `json:"policyCommitment"`
	Schema           common.Hash    `json:"schema"`
	ExtensionID      common.Hash    `json:"extensionId"`
	CodeVersion      common.Hash    `json:"codeVersion"`
	MachineIDs       [3]common.Hash `json:"machineIds"`
	KeyFingerprints  [3]common.Hash `json:"keyFingerprints"`
	CustodyThreshold uint8          `json:"custodyThreshold"`
	ResultThreshold  uint8          `json:"resultThreshold"`
	PolicyNonce      string         `json:"policyNonce"`
}

type policyReceiptWireV1 struct {
	Binding         PolicyBindingV1 `json:"binding"`
	MachineID       common.Hash     `json:"machineId"`
	KeyFingerprint  common.Hash     `json:"keyFingerprint"`
	SubmissionNonce common.Hash     `json:"submissionNonce"`
	ReceiptNonce    string          `json:"receiptNonce"`
	IssuedAt        string          `json:"issuedAt"`
	Expiry          string          `json:"expiry"`
}

type ftsoSnapshotWireV1 struct {
	FeedID     common.Hash `json:"feedId"`
	Value      string      `json:"value"`
	Decimals   uint8       `json:"decimals"`
	Timestamp  string      `json:"timestamp"`
	Checkpoint common.Hash `json:"checkpoint"`
}

type spendHistoryEntryWireV1 struct {
	Request     ActionRequestV1 `json:"request"`
	AccountedAt string          `json:"accountedAt"`
	FTSO        *FTSOSnapshotV1 `json:"ftso,omitempty"`
}

type spendStateWireV1 struct {
	AvailableBalance  string                `json:"availableBalance"`
	History           []SpendHistoryEntryV1 `json:"history"`
	OccurrenceCount   uint32                `json:"occurrenceCount"`
	LastAccountingAt  string                `json:"lastAccountingAt"`
	SpendCheckpoint   common.Hash           `json:"spendCheckpoint"`
	BalanceCheckpoint common.Hash           `json:"balanceCheckpoint"`
	Now               string                `json:"now"`
	FTSO              *FTSOSnapshotV1       `json:"ftso,omitempty"`
}

type evaluationResultWireV1 struct {
	Request             ActionRequestV1 `json:"request"`
	Decision            string          `json:"decision"`
	PublicReasonClass   string          `json:"publicReasonClass"`
	ReservedAmount      string          `json:"reservedAmount"`
	ResultingCheckpoint common.Hash     `json:"resultingCheckpoint"`
	ResultNonce         common.Hash     `json:"resultNonce"`
	Attempt             uint32          `json:"attempt"`
	IssuedAt            string          `json:"issuedAt"`
	Expiry              string          `json:"expiry"`
	MachineID           common.Hash     `json:"machineId"`
	KeyFingerprint      common.Hash     `json:"keyFingerprint"`
}

var reasonNameV1 = map[uint8]string{
	ReasonOK: "OK", ReasonPolicyDenied: "POLICY_DENIED", ReasonMalformed: "MALFORMED",
	ReasonWrongDomain: "WRONG_DOMAIN", ReasonStaleInput: "STALE_INPUT",
	ReasonDependencyUnavailable: "DEPENDENCY_UNAVAILABLE", ReasonExpired: "EXPIRED",
	ReasonStopped: "STOPPED", ReasonInsufficientBalance: "INSUFFICIENT_BALANCE",
	ReasonCapExceeded: "CAP_EXCEEDED", ReasonOccurrenceExceeded: "OCCURRENCE_EXCEEDED",
	ReasonTargetDenied: "TARGET_DENIED", ReasonRequesterDenied: "REQUESTER_DENIED",
	ReasonActionDenied: "ACTION_DENIED", ReasonFTSOInvalid: "FTSO_INVALID", ReasonCooldown: "COOLDOWN",
}

var reasonCodeV1 = func() map[string]uint8 {
	result := make(map[string]uint8, len(reasonNameV1))
	for code, name := range reasonNameV1 {
		result[name] = code
	}
	return result
}()

func decimalBig(value *big.Int, label string) (string, error) {
	if value == nil || value.Sign() < 0 {
		return "", fmt.Errorf("%s must be an unsigned decimal", label)
	}
	return value.String(), nil
}

func parseDecimalBig(value, label string) (*big.Int, error) {
	if !isDecimalString(value) {
		return nil, fmt.Errorf("%s must be an unsigned decimal string", label)
	}
	parsed, ok := new(big.Int).SetString(value, 10)
	if !ok || parsed.Sign() < 0 {
		return nil, fmt.Errorf("%s must be an unsigned decimal string", label)
	}
	return parsed, nil
}

func parseDecimalUint64(value, label string) (uint64, error) {
	if !isDecimalString(value) {
		return 0, fmt.Errorf("%s must be a uint64 decimal string", label)
	}
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a uint64 decimal string: %w", label, err)
	}
	return parsed, nil
}

func isDecimalString(value string) bool {
	if value == "" {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func actionRequestWire(request ActionRequestV1) (actionRequestWireV1, error) {
	chainID, err := decimalBig(request.ChainID, "chainId")
	if err != nil {
		return actionRequestWireV1{}, err
	}
	amount, err := decimalBig(request.Amount, "amount")
	if err != nil {
		return actionRequestWireV1{}, err
	}
	requestNonce, err := uint256(request.RequestNonce, "requestNonce")
	if err != nil {
		return actionRequestWireV1{}, err
	}
	return actionRequestWireV1{
		ChainID: chainID, Registry: request.Registry, Vault: request.Vault, Router: request.Router,
		PolicyID: request.PolicyID, PolicyVersion: request.PolicyVersion, PolicyCommitment: request.PolicyCommitment,
		RequestID: request.RequestID, RequestNonce: requestNonce.String(), Attempt: request.Attempt,
		Requester: request.Requester, Target: request.Target, Asset: request.Asset, ActionType: request.ActionType,
		Amount: amount, ScheduleSlot: strconv.FormatUint(request.ScheduleSlot, 10), Occurrence: request.Occurrence,
		SpendCheckpoint: request.SpendCheckpoint, BalanceCheckpoint: request.BalanceCheckpoint,
		InputCommitment: request.InputCommitment, CreatedAt: strconv.FormatUint(request.CreatedAt, 10),
		GraceDeadline: strconv.FormatUint(request.GraceDeadline, 10), Expiry: strconv.FormatUint(request.Expiry, 10),
	}, nil
}

func (policy PolicyV1) MarshalJSON() ([]byte, error) {
	if policy.AllowTargets == nil || policy.DenyTargets == nil || policy.AllowRequesters == nil || policy.AllowActionTypes == nil {
		return nil, fmt.Errorf("policy rule lists must be explicit arrays")
	}
	chainID, err := decimalBig(policy.ChainID, "chainId")
	if err != nil {
		return nil, err
	}
	maxPerAction, err := decimalBig(policy.MaxPerAction, "maxPerAction")
	if err != nil {
		return nil, err
	}
	dailyCap, err := decimalBig(policy.DailyCap, "dailyCap")
	if err != nil {
		return nil, err
	}
	rollingCap, err := decimalBig(policy.RollingCap, "rollingCap")
	if err != nil {
		return nil, err
	}
	return json.Marshal(policyWireV1{
		SchemaVersion: policy.SchemaVersion, ChainID: chainID, Registry: policy.Registry,
		Vault: policy.Vault, Router: policy.Router, Owner: policy.Owner, PolicyID: policy.PolicyID,
		PolicyVersion: policy.PolicyVersion, Asset: policy.Asset, ReferenceCurrency: policy.ReferenceCurrency,
		MaxPerAction: maxPerAction, DailyCap: dailyCap, RollingCap: rollingCap,
		RollingWindowSecs: strconv.FormatUint(policy.RollingWindowSecs, 10),
		StartAt:           strconv.FormatUint(policy.StartAt, 10), EndAt: strconv.FormatUint(policy.EndAt, 10),
		ScheduleIntervalSecs: strconv.FormatUint(policy.ScheduleIntervalSecs, 10),
		ScheduleGraceSecs:    strconv.FormatUint(policy.ScheduleGraceSecs, 10),
		CooldownSecs:         strconv.FormatUint(policy.CooldownSecs, 10), MaxOccurrences: policy.MaxOccurrences,
		AllowTargets: policy.AllowTargets, DenyTargets: policy.DenyTargets,
		AllowRequesters: policy.AllowRequesters, AllowActionTypes: policy.AllowActionTypes,
		RequireFTSO: policy.RequireFTSO, FTSOFeedID: policy.FTSOFeedID,
		MaxPriceAgeSecs: strconv.FormatUint(policy.MaxPriceAgeSecs, 10),
		PrivateSalt:     policy.PrivateSalt, SubmissionNonce: policy.SubmissionNonce,
	})
}

func (policy *PolicyV1) UnmarshalJSON(data []byte) error {
	var wire policyWireV1
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return fmt.Errorf("encrypted policy contains trailing data")
	}
	if wire.AllowTargets == nil || wire.DenyTargets == nil || wire.AllowRequesters == nil || wire.AllowActionTypes == nil {
		return fmt.Errorf("policy rule lists must be explicit arrays")
	}
	chainID, err := parseDecimalBig(wire.ChainID, "chainId")
	if err != nil {
		return err
	}
	maxPerAction, err := parseDecimalBig(wire.MaxPerAction, "maxPerAction")
	if err != nil {
		return err
	}
	dailyCap, err := parseDecimalBig(wire.DailyCap, "dailyCap")
	if err != nil {
		return err
	}
	rollingCap, err := parseDecimalBig(wire.RollingCap, "rollingCap")
	if err != nil {
		return err
	}
	rollingWindowSecs, err := parseDecimalUint64(wire.RollingWindowSecs, "rollingWindowSecs")
	if err != nil {
		return err
	}
	startAt, err := parseDecimalUint64(wire.StartAt, "startAt")
	if err != nil {
		return err
	}
	endAt, err := parseDecimalUint64(wire.EndAt, "endAt")
	if err != nil {
		return err
	}
	scheduleIntervalSecs, err := parseDecimalUint64(wire.ScheduleIntervalSecs, "scheduleIntervalSecs")
	if err != nil {
		return err
	}
	scheduleGraceSecs, err := parseDecimalUint64(wire.ScheduleGraceSecs, "scheduleGraceSecs")
	if err != nil {
		return err
	}
	cooldownSecs, err := parseDecimalUint64(wire.CooldownSecs, "cooldownSecs")
	if err != nil {
		return err
	}
	maxPriceAgeSecs, err := parseDecimalUint64(wire.MaxPriceAgeSecs, "maxPriceAgeSecs")
	if err != nil {
		return err
	}
	decoded := PolicyV1{
		SchemaVersion: wire.SchemaVersion, ChainID: chainID, Registry: wire.Registry,
		Vault: wire.Vault, Router: wire.Router, Owner: wire.Owner, PolicyID: wire.PolicyID,
		PolicyVersion: wire.PolicyVersion, Asset: wire.Asset, ReferenceCurrency: wire.ReferenceCurrency,
		MaxPerAction: maxPerAction, DailyCap: dailyCap, RollingCap: rollingCap,
		RollingWindowSecs: rollingWindowSecs, StartAt: startAt, EndAt: endAt,
		ScheduleIntervalSecs: scheduleIntervalSecs, ScheduleGraceSecs: scheduleGraceSecs,
		CooldownSecs: cooldownSecs, MaxOccurrences: wire.MaxOccurrences,
		AllowTargets: wire.AllowTargets, DenyTargets: wire.DenyTargets,
		AllowRequesters: wire.AllowRequesters, AllowActionTypes: wire.AllowActionTypes,
		RequireFTSO: wire.RequireFTSO, FTSOFeedID: wire.FTSOFeedID,
		MaxPriceAgeSecs: maxPriceAgeSecs, PrivateSalt: wire.PrivateSalt,
		SubmissionNonce: wire.SubmissionNonce,
	}
	normalized, err := normalizePolicy(decoded)
	if err != nil {
		return fmt.Errorf("invalid encrypted policy: %w", err)
	}
	*policy = normalized
	return nil
}

func (binding PolicyBindingV1) MarshalJSON() ([]byte, error) {
	chainID, err := decimalBig(binding.ChainID, "chainId")
	if err != nil {
		return nil, err
	}
	return json.Marshal(policyBindingWireV1{
		ChainID: chainID, Registry: binding.Registry, Vault: binding.Vault, Router: binding.Router,
		Owner: binding.Owner, PolicyID: binding.PolicyID, PolicyVersion: binding.PolicyVersion,
		PolicyCommitment: binding.PolicyCommitment, Schema: binding.Schema, ExtensionID: binding.ExtensionID,
		CodeVersion: binding.CodeVersion, MachineIDs: binding.MachineIDs, KeyFingerprints: binding.KeyFingerprints,
		CustodyThreshold: binding.CustodyThreshold, ResultThreshold: binding.ResultThreshold,
		PolicyNonce: strconv.FormatUint(binding.PolicyNonce, 10),
	})
}

func (binding *PolicyBindingV1) UnmarshalJSON(data []byte) error {
	var wire policyBindingWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	chainID, err := parseDecimalBig(wire.ChainID, "chainId")
	if err != nil {
		return err
	}
	policyNonce, err := parseDecimalUint64(wire.PolicyNonce, "policyNonce")
	if err != nil {
		return err
	}
	*binding = PolicyBindingV1{
		ChainID: chainID, Registry: wire.Registry, Vault: wire.Vault, Router: wire.Router, Owner: wire.Owner,
		PolicyID: wire.PolicyID, PolicyVersion: wire.PolicyVersion, PolicyCommitment: wire.PolicyCommitment,
		Schema: wire.Schema, ExtensionID: wire.ExtensionID, CodeVersion: wire.CodeVersion,
		MachineIDs: wire.MachineIDs, KeyFingerprints: wire.KeyFingerprints,
		CustodyThreshold: wire.CustodyThreshold, ResultThreshold: wire.ResultThreshold, PolicyNonce: policyNonce,
	}
	return nil
}

func (receipt PolicyReceiptV1) MarshalJSON() ([]byte, error) {
	return json.Marshal(policyReceiptWireV1{
		Binding: receipt.Binding, MachineID: receipt.MachineID, KeyFingerprint: receipt.KeyFingerprint,
		SubmissionNonce: receipt.SubmissionNonce, ReceiptNonce: strconv.FormatUint(receipt.ReceiptNonce, 10),
		IssuedAt: strconv.FormatUint(receipt.IssuedAt, 10), Expiry: strconv.FormatUint(receipt.Expiry, 10),
	})
}

func (receipt *PolicyReceiptV1) UnmarshalJSON(data []byte) error {
	var wire policyReceiptWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	receiptNonce, err := parseDecimalUint64(wire.ReceiptNonce, "receiptNonce")
	if err != nil {
		return err
	}
	issuedAt, err := parseDecimalUint64(wire.IssuedAt, "issuedAt")
	if err != nil {
		return err
	}
	expiry, err := parseDecimalUint64(wire.Expiry, "expiry")
	if err != nil {
		return err
	}
	*receipt = PolicyReceiptV1{
		Binding: wire.Binding, MachineID: wire.MachineID, KeyFingerprint: wire.KeyFingerprint,
		SubmissionNonce: wire.SubmissionNonce, ReceiptNonce: receiptNonce, IssuedAt: issuedAt, Expiry: expiry,
	}
	return nil
}

func (request ActionRequestV1) MarshalJSON() ([]byte, error) {
	wire, err := actionRequestWire(request)
	if err != nil {
		return nil, err
	}
	return json.Marshal(wire)
}

func (request *ActionRequestV1) UnmarshalJSON(data []byte) error {
	var wire actionRequestWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	chainID, err := parseDecimalBig(wire.ChainID, "chainId")
	if err != nil {
		return err
	}
	requestNonce, err := parseDecimalBig(wire.RequestNonce, "requestNonce")
	if err != nil {
		return err
	}
	requestNonce, err = uint256(requestNonce, "requestNonce")
	if err != nil {
		return err
	}
	amount, err := parseDecimalBig(wire.Amount, "amount")
	if err != nil {
		return err
	}
	scheduleSlot, err := parseDecimalUint64(wire.ScheduleSlot, "scheduleSlot")
	if err != nil {
		return err
	}
	createdAt, err := parseDecimalUint64(wire.CreatedAt, "createdAt")
	if err != nil {
		return err
	}
	graceDeadline, err := parseDecimalUint64(wire.GraceDeadline, "graceDeadline")
	if err != nil {
		return err
	}
	expiry, err := parseDecimalUint64(wire.Expiry, "expiry")
	if err != nil {
		return err
	}
	*request = ActionRequestV1{
		ChainID: chainID, Registry: wire.Registry, Vault: wire.Vault, Router: wire.Router,
		PolicyID: wire.PolicyID, PolicyVersion: wire.PolicyVersion, PolicyCommitment: wire.PolicyCommitment,
		RequestID: wire.RequestID, RequestNonce: requestNonce, Attempt: wire.Attempt, Requester: wire.Requester,
		Target: wire.Target, Asset: wire.Asset, ActionType: wire.ActionType, Amount: amount,
		ScheduleSlot: scheduleSlot, Occurrence: wire.Occurrence, SpendCheckpoint: wire.SpendCheckpoint,
		BalanceCheckpoint: wire.BalanceCheckpoint, InputCommitment: wire.InputCommitment,
		CreatedAt: createdAt, GraceDeadline: graceDeadline, Expiry: expiry,
	}
	return nil
}

func (snapshot FTSOSnapshotV1) MarshalJSON() ([]byte, error) {
	value, err := decimalBig(snapshot.Value, "value")
	if err != nil {
		return nil, err
	}
	return json.Marshal(ftsoSnapshotWireV1{FeedID: snapshot.FeedID, Value: value, Decimals: snapshot.Decimals, Timestamp: strconv.FormatUint(snapshot.Timestamp, 10), Checkpoint: snapshot.Checkpoint})
}

func (snapshot *FTSOSnapshotV1) UnmarshalJSON(data []byte) error {
	var wire ftsoSnapshotWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	value, err := parseDecimalBig(wire.Value, "value")
	if err != nil {
		return err
	}
	timestamp, err := parseDecimalUint64(wire.Timestamp, "timestamp")
	if err != nil {
		return err
	}
	*snapshot = FTSOSnapshotV1{FeedID: wire.FeedID, Value: value, Decimals: wire.Decimals, Timestamp: timestamp, Checkpoint: wire.Checkpoint}
	return nil
}

func (entry SpendHistoryEntryV1) MarshalJSON() ([]byte, error) {
	return json.Marshal(spendHistoryEntryWireV1{Request: entry.Request, AccountedAt: strconv.FormatUint(entry.AccountedAt, 10), FTSO: entry.FTSO})
}

func (entry *SpendHistoryEntryV1) UnmarshalJSON(data []byte) error {
	var wire spendHistoryEntryWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	accountedAt, err := parseDecimalUint64(wire.AccountedAt, "accountedAt")
	if err != nil {
		return err
	}
	*entry = SpendHistoryEntryV1{Request: wire.Request, AccountedAt: accountedAt, FTSO: wire.FTSO}
	return nil
}

func (state SpendStateV1) MarshalJSON() ([]byte, error) {
	if state.History == nil {
		return nil, fmt.Errorf("history must be an explicit array")
	}
	availableBalance, err := decimalBig(state.AvailableBalance, "availableBalance")
	if err != nil {
		return nil, err
	}
	return json.Marshal(spendStateWireV1{
		AvailableBalance: availableBalance, History: state.History, OccurrenceCount: state.OccurrenceCount,
		LastAccountingAt: strconv.FormatUint(state.LastAccountingAt, 10), SpendCheckpoint: state.SpendCheckpoint,
		BalanceCheckpoint: state.BalanceCheckpoint, Now: strconv.FormatUint(state.Now, 10), FTSO: state.FTSO,
	})
}

func (state *SpendStateV1) UnmarshalJSON(data []byte) error {
	var wire spendStateWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	availableBalance, err := parseDecimalBig(wire.AvailableBalance, "availableBalance")
	if err != nil {
		return err
	}
	lastAccountingAt, err := parseDecimalUint64(wire.LastAccountingAt, "lastAccountingAt")
	if err != nil {
		return err
	}
	now, err := parseDecimalUint64(wire.Now, "now")
	if err != nil {
		return err
	}
	*state = SpendStateV1{
		AvailableBalance: availableBalance, History: wire.History, OccurrenceCount: wire.OccurrenceCount,
		LastAccountingAt: lastAccountingAt, SpendCheckpoint: wire.SpendCheckpoint,
		BalanceCheckpoint: wire.BalanceCheckpoint, Now: now, FTSO: wire.FTSO,
	}
	return nil
}

func (result EvaluationResultV1) MarshalJSON() ([]byte, error) {
	decision := "DENY"
	if result.Decision == DecisionAllow {
		decision = "ALLOW"
	} else if result.Decision != DecisionDeny {
		return nil, fmt.Errorf("unknown decision code %d", result.Decision)
	}
	reason, ok := reasonNameV1[result.PublicReasonClass]
	if !ok {
		return nil, fmt.Errorf("unknown reason code %d", result.PublicReasonClass)
	}
	reservedAmount, err := decimalBig(result.ReservedAmount, "reservedAmount")
	if err != nil {
		return nil, err
	}
	return json.Marshal(evaluationResultWireV1{
		Request: result.Request, Decision: decision, PublicReasonClass: reason, ReservedAmount: reservedAmount,
		ResultingCheckpoint: result.ResultingCheckpoint, ResultNonce: result.ResultNonce, Attempt: result.Attempt,
		IssuedAt: strconv.FormatUint(result.IssuedAt, 10), Expiry: strconv.FormatUint(result.Expiry, 10),
		MachineID: result.MachineID, KeyFingerprint: result.KeyFingerprint,
	})
}

func (result *EvaluationResultV1) UnmarshalJSON(data []byte) error {
	var wire evaluationResultWireV1
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	decision := DecisionDeny
	if wire.Decision == "ALLOW" {
		decision = DecisionAllow
	} else if wire.Decision != "DENY" {
		return fmt.Errorf("unknown decision %q", wire.Decision)
	}
	reason, ok := reasonCodeV1[wire.PublicReasonClass]
	if !ok {
		return fmt.Errorf("unknown reason %q", wire.PublicReasonClass)
	}
	reservedAmount, err := parseDecimalBig(wire.ReservedAmount, "reservedAmount")
	if err != nil {
		return err
	}
	issuedAt, err := parseDecimalUint64(wire.IssuedAt, "issuedAt")
	if err != nil {
		return err
	}
	expiry, err := parseDecimalUint64(wire.Expiry, "expiry")
	if err != nil {
		return err
	}
	*result = EvaluationResultV1{
		Request: wire.Request, Decision: decision, PublicReasonClass: reason, ReservedAmount: reservedAmount,
		ResultingCheckpoint: wire.ResultingCheckpoint, ResultNonce: wire.ResultNonce, Attempt: wire.Attempt,
		IssuedAt: issuedAt, Expiry: expiry, MachineID: wire.MachineID, KeyFingerprint: wire.KeyFingerprint,
	}
	return nil
}
