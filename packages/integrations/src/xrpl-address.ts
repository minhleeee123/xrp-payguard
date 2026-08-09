import { bytesToHex, hexToBytes, sha256 } from "viem";

const XRP_BASE58_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";
const CLASSIC_ADDRESS_BYTES = 25;
const ACCOUNT_ID_VERSION = 0;

function decodeXrpBase58(value: string): Uint8Array | null {
  if (value.length < 25 || value.length > 35) return null;
  let decoded = 0n;
  for (const character of value) {
    const digit = XRP_BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return null;
    decoded = decoded * 58n + BigInt(digit);
  }
  const encoded = decoded.toString(16);
  let body = decoded === 0n ? new Uint8Array() : hexToBytes(
    `0x${encoded.padStart(Math.ceil(encoded.length / 2) * 2, "0")}`,
  );
  let leadingZeroes = 0;
  while (value[leadingZeroes] === XRP_BASE58_ALPHABET[0]) leadingZeroes += 1;
  if (leadingZeroes > 0) {
    const padded = new Uint8Array(leadingZeroes + body.length);
    padded.set(body, leadingZeroes);
    body = padded;
  }
  return body;
}

function checksum(payload: Uint8Array): Uint8Array {
  return hexToBytes(sha256(sha256(bytesToHex(payload)))).slice(0, 4);
}

/**
 * Runtime-safe XRPL classic-address validation. This implements the same
 * version-0, 20-byte Base58Check boundary as xrpl.js without importing its
 * browser/client bundle into server-side proof parsers.
 */
export function isValidXrplClassicAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const decoded = decodeXrpBase58(value);
  if (decoded === null || decoded.length !== CLASSIC_ADDRESS_BYTES
    || decoded[0] !== ACCOUNT_ID_VERSION) return false;
  const payload = decoded.slice(0, -4);
  const expected = checksum(payload);
  const actual = decoded.slice(-4);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index]! ^ actual[index]!;
  }
  return difference === 0;
}
