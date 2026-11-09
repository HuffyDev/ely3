import crypto from "node:crypto";
import { secrets } from "./config";

function key(hex: string, name: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${name} must be 64 hex characters (set it in .env)`);
  return Buffer.from(hex, "hex");
}

export function proofKeyAvailable() {
  return /^[0-9a-fA-F]{64}$/.test(secrets.proofKeyHex());
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string, hexKey = secrets.proofKeyHex()): string {
  const k = key(hexKey, "PROOF_ENCRYPTION_KEY");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(blob: string, hexKey = secrets.proofKeyHex()): string {
  const k = key(hexKey, "PROOF_ENCRYPTION_KEY");
  const buf = Buffer.from(blob, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function hmac(data: string, hexKey = secrets.sessionSecretHex()): string {
  return crypto.createHmac("sha256", key(hexKey, "SESSION_SECRET")).update(data).digest("base64url");
}

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function timingSafeEqualStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
