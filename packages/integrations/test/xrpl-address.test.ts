import { describe, expect, it } from "vitest";
import { isValidClassicAddress } from "xrpl";
import { isValidXrplClassicAddress } from "../src/xrpl-address.js";

const vectors = [
  "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
  "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  "rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh",
];

describe("runtime-safe XRPL classic-address validator", () => {
  it("matches xrpl.js for canonical vectors and checksum mutations", () => {
    for (const value of vectors) {
      expect(isValidXrplClassicAddress(value)).toBe(true);
      expect(isValidXrplClassicAddress(value)).toBe(isValidClassicAddress(value));
      const mutated = `${value.slice(0, -1)}${value.endsWith("p") ? "r" : "p"}`;
      expect(isValidXrplClassicAddress(mutated)).toBe(false);
      expect(isValidXrplClassicAddress(mutated)).toBe(isValidClassicAddress(mutated));
    }
  });

  it("rejects wrong versions, alphabets, lengths, and non-strings", () => {
    for (const value of ["XVLhHMPHU98es4dbozjVtdWzVrDjtV1AqP", "r0invalid", "r", "", null, 7]) {
      expect(isValidXrplClassicAddress(value)).toBe(false);
    }
  });
});
