const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Removes unpaired UTF-16 surrogates, which make encodeURIComponent throw. */
export function stripLoneSurrogates(value: string): string {
  return value.replace(LONE_SURROGATE, "");
}

/**
 * Truncates to at most `max` UTF-16 units without ever splitting a surrogate
 * pair (an emoji is dropped whole rather than left as a lone high surrogate)
 * and without keeping unpaired surrogates. Grapheme clusters made of several
 * code points (for example ZWJ emoji) may still be cut between code points,
 * but the result is always well-formed text.
 */
export function clampText(value: string, max: number): string {
  const clean = stripLoneSurrogates(value);
  if (clean.length <= max) return clean;
  let end = max;
  const last = clean.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return clean.slice(0, end);
}
