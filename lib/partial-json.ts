/**
 * Tolerant JSON parser for streaming.
 *
 * The Anthropic streaming API emits `input_json_delta` chunks that are
 * fragments of the eventual JSON. We accumulate them and want to render
 * UI off the *partial* state — e.g. as soon as a step's title is in the
 * buffer, render the step card; as soon as the rationale starts, stream
 * it character-by-character.
 *
 * Strategy: try `JSON.parse` directly. If it fails, repair the string by
 *   - closing any unterminated string with "
 *   - dropping a trailing key with no colon/value
 *   - filling a trailing colon with null
 *   - stripping trailing commas
 *   - closing any unclosed { or [
 *
 * If the *first* repair attempt still doesn't parse (e.g. mid-number,
 * mid-literal), retreat to the last syntactically-safe boundary
 * (last comma at top depth) and try again.
 *
 * This is good enough for the planner's tool input — well-shaped JSON
 * with nested arrays/objects/strings.
 */
export function parsePartialJson(input: string): unknown | null {
  if (!input || !input.trim()) return null;

  // Fast path: already valid.
  try {
    return JSON.parse(input);
  } catch {}

  // Repair attempts in increasing aggressiveness.
  for (const candidate of repairCandidates(input)) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function* repairCandidates(s: string): Generator<string> {
  // Attempt 1: close strings + balance brackets + drop dangling keys.
  yield closeUp(s);

  // Attempt 2: also handle the case where we're mid-number/literal.
  // Strip trailing non-whitespace word characters that aren't part of a
  // closed string, then close.
  yield closeUp(stripTrailingPartialAtom(s));

  // Attempt 3: retreat to the last top-level comma (or open-bracket) and
  // close. This loses trailing in-progress fields but never returns
  // garbage.
  const safe = retreatToSafeBoundary(s);
  if (safe !== null && safe !== s) {
    yield closeUp(safe);
  }
}

/**
 * Walk the string. Track whether we're in a string, and the stack of
 * open brackets. Return a closed-up version of the string that is most
 * likely to parse.
 */
function closeUp(s: string): string {
  const { inString, stack, lastNonWsIdx } = scan(s);
  let out = s;
  if (inString) out += '"';
  // Trim trailing whitespace + commas.
  out = out.replace(/[\s,]+$/, "");

  // If the trailing token is a key with no colon (e.g. `,"ba"` at end of
  // an object), drop it. We detect by: inside an object, last "}-eligible"
  // text is a quoted string with no following colon.
  // Pattern: `(<comma|brace> [whitespace])"<key>"` at end.
  const m = out.match(/^(.*[,{]\s*)"[^"\\]*"$/s);
  if (m) {
    // Check that we're inside an object (top of stack is `{`).
    const topIsObj = stack.length > 0 && stack[stack.length - 1] === "}";
    if (topIsObj) {
      out = m[1].replace(/[\s,]+$/, "");
    }
  }

  // If ends with `:`, fill with null.
  if (/:\s*$/.test(out)) out += "null";

  // Close any open brackets in reverse order.
  // We need to recompute the stack after possible trimming, since we may
  // have stripped past some opens. Do it again on the trimmed string.
  const finalStack = scan(out).stack;
  while (finalStack.length) {
    out += finalStack.pop();
  }
  return out;

  // Suppress unused warning.
  void lastNonWsIdx;
}

function scan(s: string): {
  inString: boolean;
  stack: string[];
  lastNonWsIdx: number;
} {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastNonWsIdx = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      if (c.trim()) lastNonWsIdx = i;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      if (c.trim()) lastNonWsIdx = i;
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === "{") {
      stack.push("}");
    } else if (c === "[") {
      stack.push("]");
    } else if (c === "}" || c === "]") {
      stack.pop();
    }
    if (c.trim()) lastNonWsIdx = i;
  }
  return { inString, stack, lastNonWsIdx };
}

/**
 * Strip a trailing partial atom (number, true/false/null fragment).
 * Only used when the simple close didn't parse — implies we cut off in
 * the middle of a non-string atom.
 */
function stripTrailingPartialAtom(s: string): string {
  // Walk from the end while we're inside a non-string atom (chars
  // [0-9eE+.\-truefalsen]). Stop when we hit whitespace, comma, colon,
  // bracket, brace, or quote.
  let i = s.length;
  while (i > 0 && /[0-9eE+\-.truefalsn]/.test(s[i - 1])) i--;
  // Don't trim past meaningful boundaries.
  return s.slice(0, i);
}

/**
 * Retreat to the last position where the JSON was at a syntactically
 * safe boundary — i.e. just after a complete value at the *current* top
 * frame, or just after a comma. We approximate by walking the string
 * with state tracking and remembering the last "settled" index.
 */
function retreatToSafeBoundary(s: string): string | null {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastSettled = -1;
  // After a colon, the next value is the "value" of the key — when it
  // settles, we record the position.
  // After a comma, we're back to "expecting next entry"; the position
  // before the comma is settled.
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') {
        inString = false;
        lastSettled = i;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === "{") {
      stack.push("}");
    } else if (c === "[") {
      stack.push("]");
    } else if (c === "}" || c === "]") {
      stack.pop();
      lastSettled = i;
    } else if (c === ",") {
      lastSettled = i - 1;
    }
  }
  if (lastSettled < 0) return null;
  return s.slice(0, lastSettled + 1);
}
