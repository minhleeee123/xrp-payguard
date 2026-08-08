import { describe, expect, it } from "vitest";
import { padHex, stringToHex, zeroHash, type Hex } from "viem";
import {
  PUBLIC_NOTIFICATION_V1,
  buildPublicNotificationExport,
  buildPublicNotificationFeed,
  buildUnavailableNotificationExport,
  decodePublicNotification,
  decodePublicNotificationExport,
  decodePublicNotificationFeed,
  encodePublicNotificationExport,
  encodePublicNotificationFeed,
  publicNotificationHash,
  publicNotificationExportHash,
  publicNotificationReadState,
  unavailableNotificationState,
  type PublicNotificationV1,
} from "../src/notifications.js";

const id = (value: string): Hex => padHex(stringToHex(value), { size: 32 });
const requestId = id("request");

function notification(overrides: Partial<Omit<PublicNotificationV1, "schema" | "notificationHash">> = {}): PublicNotificationV1 {
  const body: Omit<PublicNotificationV1, "schema" | "notificationHash"> = {
    chainId: 114n,
    eventId: id("event"),
    kind: "REQUEST_READY",
    severity: "INFO",
    reference: id("request-hash"),
    requestId,
    blockNumber: 42n,
    observedAt: 100n,
    ...overrides,
  };
  return { schema: PUBLIC_NOTIFICATION_V1, ...body, notificationHash: publicNotificationHash(body) };
}

describe("public notification feed and export", () => {
  it("canonicalizes a public-only feed, sorts it, and preserves decimal wire values", () => {
    const older = notification({ eventId: id("older"), observedAt: 90n, blockNumber: 41n });
    const newer = notification({ eventId: id("newer"), observedAt: 110n, blockNumber: 43n, kind: "REQUEST_EXECUTED" });
    const feed = buildPublicNotificationFeed({ chainId: 114n, generatedAt: 120n, notifications: [older, newer] });
    expect(feed.notifications.map((item) => item.eventId)).toEqual([id("newer"), id("older")]);
    expect(decodePublicNotificationFeed(encodePublicNotificationFeed(feed))).toEqual(feed);
    expect(publicNotificationReadState(feed)).toMatchObject({ status: "READY", publicFacts: true });
    const exported = buildPublicNotificationExport(feed, 121n);
    const wire = encodePublicNotificationExport(exported);
    expect(wire.exportedAt).toBe("121");
    expect(decodePublicNotificationExport(wire)).toEqual(exported);
    const forgedFeed = { ...exported, feedHash: id("forged-feed") };
    expect(() => decodePublicNotificationExport({ ...encodePublicNotificationExport(forgedFeed), exportHash: publicNotificationExportHash(forgedFeed) })).toThrow(/feed hash mismatch/);
    const publicJson = JSON.stringify(wire);
    expect(publicJson).not.toContain("policy");
    expect(publicJson).not.toContain("ciphertext");
    expect(publicJson).not.toContain("privateSalt");
  });

  it("rejects private fields, request-less request events, severity drift, hash drift, and duplicate events", () => {
    const base = notification();
    const wire = {
      schema: base.schema,
      chainId: base.chainId.toString(),
      eventId: base.eventId,
      kind: base.kind,
      severity: base.severity,
      reference: base.reference,
      requestId: base.requestId,
      blockNumber: base.blockNumber.toString(),
      observedAt: base.observedAt.toString(),
      notificationHash: base.notificationHash,
    };
    expect(() => decodePublicNotification({ ...wire, ciphertext: "never" })).toThrow(/unknown public notification field/);
    expect(() => decodePublicNotification({ ...wire, requestId: zeroHash })).toThrow(/requires requestId/);
    expect(() => decodePublicNotification({ ...wire, severity: "WARNING" })).toThrow(/severity/);
    expect(() => decodePublicNotification({ ...wire, notificationHash: id("forged") })).toThrow(/hash/);
  });

  it("fails closed for duplicate feed events and unavailable exports", () => {
    const base = notification();
    expect(() => buildPublicNotificationFeed({ chainId: 114n, generatedAt: 120n, notifications: [base, base] })).toThrow(/duplicate/);
    const unavailable = buildUnavailableNotificationExport("FEED_UNFINALIZED", 121n);
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(unavailable.notifications).toHaveLength(0);
    expect(unavailable.feedHash).toBe(zeroHash);
    expect(decodePublicNotificationExport(encodePublicNotificationExport(unavailable))).toEqual(unavailable);
    expect(unavailableNotificationState("FEED_INVALID")).toEqual({ status: "UNAVAILABLE", reason: "FEED_INVALID", publicFacts: false });
  });
});
