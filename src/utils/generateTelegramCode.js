import crypto from "crypto";

export function generateTelegramCode() {
  const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TG-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}
