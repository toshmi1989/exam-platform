/**
 * Normalize name for attestation search: same logic as Python parser.
 * - trim, lower, collapse spaces, normalize apostrophe variants to U+0027.
 */
export function normalizeName(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/\s+/g, ' ');
  const apostropheVariants = [/\u2019/g, /o\u02bb/g, /o'/gi, /\u045E/g]; // ', oʻ, o', ў
  for (const re of apostropheVariants) {
    s = s.replace(re, "'");
  }
  return s.trim();
}
