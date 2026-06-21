import crypto from "crypto";

// Generates a human-friendly, high-entropy one-time Telegram link code.
// Example: TG-AB12-CD34-EF56
export function generateTelegramCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = crypto.randomBytes(16);

  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }

  // take 12 chars (enough entropy) and format
  const s = out.slice(0, 12);
  const a = s.slice(0, 4);
  const b = s.slice(4, 8);
  const c = s.slice(8, 12);
  return `TG-${a}-${b}-${c}`;
}
