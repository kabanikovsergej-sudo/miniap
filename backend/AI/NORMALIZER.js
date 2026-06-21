// NightcoreX AI — Article Normalizer (Grapeseed)
export function normalizeArticle(raw) {
  if (!raw) return { law: null, code: null };

  let s = String(raw).toLowerCase().trim();

  // separators + common typos: 12ю8 -> 12.8
  s = s.replace(/ю/g, ".")
       .replace(/,/g, ".")
       .replace(/-/g, ".")
       .replace(/\s+/g, "");

  // explicit law hint
  let law = null;
  if (s.includes("дк")) law = "ДК";
  else if (s.includes("ак")) law = "АК";
  else if (s.includes("ук")) law = "УК";

  // strip non-digit/dot
  const cleaned = s.replace(/[^0-9.]/g, "").replace(/\.{2,}/g, ".");

  const uk = cleaned.match(/\b\d{1,2}\.\d{1,2}(\.\d{1,2})?\b/);
  const dk = cleaned.match(/\b\d{1,3}\b/);

  if (law === "ДК" && dk) return { law, code: dk[0] };
  if (law === "АК" && uk) return { law, code: uk[0] };

  if (uk) return { law: law || "УК", code: uk[0] };
  if (dk) return { law: law || "ДК", code: dk[0] };

  return { law: law || null, code: null };
}
