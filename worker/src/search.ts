// Pure search logic: how a raw query box string becomes a DB query, and how
// contributors render. No I/O — see test/search.test.ts. DB execution lives in
// db.ts; behaviour is pinned by features/search.feature.
import { fold } from "./fold";

export type QueryKind =
  | { type: "empty" }
  | { type: "isbn"; prefix: string }
  | { type: "text"; match: string };

/** Decide how to run a query: empty, ISBN-prefix, or full-text. */
export function classifyQuery(raw: string): QueryKind {
  const q = raw.trim();
  if (!q) return { type: "empty" };
  const cleaned = q.replace(/[\s-]/g, "").toUpperCase();
  // 8+ "digits" looks like an ISBN (or a prefix of one); shorter numbers
  // (years, etc.) fall through to text search so e.g. "1984" finds the title.
  if (/^\d{8,13}$/.test(cleaned) || /^\d{9}X$/.test(cleaned)) {
    return { type: "isbn", prefix: cleaned };
  }
  const match = buildFtsMatch(q);
  return match ? { type: "text", match } : { type: "empty" };
}

/** Build an FTS5 MATCH string: folded word tokens, each a prefix term. */
export function buildFtsMatch(raw: string): string {
  const tokens = fold(raw).match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((t) => `"${t}"*`).join(" ");
}

export type Contribution = {
  name_as_printed: string;
  role: string;
  position: number;
};

const ROLE_ORDER: Record<string, number> = {
  author: 0,
  editor: 1,
  illustrator: 2,
  translator: 3,
};
const ROLE_SUFFIX: Record<string, string> = {
  author: "",
  editor: " (ed.)",
  illustrator: " (ill.)",
  translator: " (tr.)",
};

/** "Tolkien, Anderson (ed.), Lee (ill.), Ohlmarks (tr.)" — foreword omitted. */
export function formatContributors(cs: Contribution[]): string {
  return cs
    .filter((c) => c.role in ROLE_ORDER)
    .slice()
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.position - b.position,
    )
    .map((c) => c.name_as_printed + ROLE_SUFFIX[c.role])
    .join(", ");
}

/** Parse the stored JSON languages array into display codes. */
export function formatLanguages(json: string | null): string {
  if (!json) return "";
  try {
    const codes = JSON.parse(json) as unknown;
    return Array.isArray(codes) ? codes.join(", ") : "";
  } catch {
    return "";
  }
}
