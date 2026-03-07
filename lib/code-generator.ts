import { randomUUID } from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0, O, 1, I to avoid confusion

export function generateBookingCode(): string {
  let code = "";
  const charsLength = CHARS.length;
  for (let i = 0; i < 4; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * charsLength));
  }
  return code;
}

/**
 * Generate a UUID-based token for the self-service cancellation URL
 */
export function generateCancelToken(): string {
  return randomUUID().replace(/-/g, "");
}
