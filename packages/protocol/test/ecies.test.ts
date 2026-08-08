import { describe, expect, it } from "vitest";
import { encryptForTeeV1, teeMachineDescriptorV1, testEncryptForTeeV1 } from "../src/ecies.js";

const recipient = {
  x: "0x2c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991",
  y: "0xae31a9c671a36543f46cea8fce6984608aa316aa0472a7eed08847440218cb2f",
} as const;

describe("tee-node compatible PayGuard ECIES", () => {
  it("derives the machine identity and produces a deterministic cross-language vector", async () => {
    expect(teeMachineDescriptorV1(recipient)).toEqual({
      signer: "0x7564105E977516C53bE337314c7E53838967bDaC",
      machineId: "0x0000000000000000000000007564105e977516c53be337314c7e53838967bdac",
      keyFingerprint: "0x6ab1757c2549dcaafef121277564105e977516c53be337314c7e53838967bdac",
    });
    const ciphertext = await testEncryptForTeeV1(new TextEncoder().encode("PAYGUARD_ECIES_VECTOR_V1"), recipient, {
      ephemeralPrivateKey: `0x${"11".repeat(32)}`,
      iv: `0x${"22".repeat(16)}`,
    });
    expect(ciphertext).toBe(
      "0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c122222222222222222222222222222222d168106798015fbeef771d89595c0440971d3d299f0e4c0ed341750161c273a472fb78ba1cd6f13d3503223f704bc95735a705f095cd0662",
    );
  });

  it("rejects invalid public keys and empty plaintext", async () => {
    expect(() => teeMachineDescriptorV1({ x: `0x${"00".repeat(32)}`, y: `0x${"00".repeat(32)}` })).toThrow(/invalid TEE public key/);
    await expect(encryptForTeeV1(new Uint8Array(), recipient)).rejects.toThrow(/invalid private policy size/);
  });
});
