export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export function shortId(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function recipeSlug(title: string): string {
  const base = slugify(title) || "recipe";
  return `${base}-${shortId(6)}`;
}
