import { describe, expect, it } from "vitest";
import { createRelayServer } from "../src/http.js";
import { Relay } from "../src/relay.js";
import type { MachineTransport } from "../src/types.js";

const unavailableTransport: MachineTransport = {
  async evaluate() {
    throw new Error("offline");
  },
};

describe("relay HTTP boundary", () => {
  it("exposes health and rejects private ingress material", async () => {
    const server = createRelayServer(new Relay({ transport: unavailableTransport }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok", service: "payguard-relay" });
      const privatePayload = await fetch(`http://127.0.0.1:${address.port}/v1/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ciphertext: "should-never-cross-relay" }),
      });
      expect(privatePayload.status).toBe(400);
      expect(await privatePayload.text()).not.toContain("should-never-cross-relay");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
