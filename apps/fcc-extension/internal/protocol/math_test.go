package protocol

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type mathVector struct {
	Name     string `json:"name"`
	Amount   string `json:"amount"`
	Price    string `json:"price"`
	Decimals uint8  `json:"decimals"`
	Expected string `json:"expected"`
	Valid    bool   `json:"valid"`
}

func TestReferenceValueV1SharedVectors(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../../../packages/protocol/fixtures/math-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Schema    string       `json:"schema"`
		Rounding  string       `json:"rounding"`
		CaseCount int          `json:"caseCount"`
		Cases     []mathVector `json:"cases"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Schema != "REFERENCE_VALUE_V1" || fixture.Rounding != "CEILING" || fixture.CaseCount != len(fixture.Cases) {
		t.Fatal("unexpected reference math fixture domain")
	}
	for _, vector := range fixture.Cases {
		t.Run(vector.Name, func(t *testing.T) {
			actual, valid := ReferenceValueV1(mathBig(vector.Amount), mathBig(vector.Price), vector.Decimals)
			if valid != vector.Valid {
				t.Fatalf("validity mismatch: %v", valid)
			}
			if valid && actual.Cmp(mathBig(vector.Expected)) != 0 {
				t.Fatalf("value mismatch: %s", actual)
			}
		})
	}
}

func TestReferenceValueV1RejectsOutsideWireRange(t *testing.T) {
	aboveUint256 := new(big.Int).Add(new(big.Int).Set(maxUint256), big.NewInt(1))
	for _, test := range []struct {
		amount *big.Int
		price  *big.Int
	}{
		{amount: big.NewInt(-1), price: big.NewInt(1)},
		{amount: big.NewInt(1), price: big.NewInt(-1)},
		{amount: aboveUint256, price: big.NewInt(1)},
		{amount: big.NewInt(1), price: aboveUint256},
	} {
		if _, valid := ReferenceValueV1(test.amount, test.price, 0); valid {
			t.Fatal("out-of-range input was accepted")
		}
	}
}

func mathBig(value string) *big.Int {
	result, ok := new(big.Int).SetString(value, 10)
	if !ok {
		panic("invalid math vector integer")
	}
	return result
}
