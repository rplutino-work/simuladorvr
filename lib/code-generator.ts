import { randomUUID, randomInt } from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0, O, 1, I to avoid confusion

/**
 * 4-char access code from a CSPRNG (crypto.randomInt) — not Math.random, which
 * is predictable. Brute-forcing the 4-char space is blocked by the rate limit
 * on /api/tablet/activate.
 */
export function generateBookingCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CHARS.charAt(randomInt(CHARS.length));
  }
  return code;
}

/**
 * Generate a UUID-based token for the self-service cancellation URL
 */
export function generateCancelToken(): string {
  return randomUUID().replace(/-/g, "");
}
