const ARABIC_CHAR = /[\u0600-\u06FF]/;

/**
 * Display-only split for Layer-1 screener strings authored as
 * "English side / الجانب العربي" (each side may contain internal slashes).
 * Keeps stored answer values unchanged — use only when rendering labels.
 */
export function pickBilingualDisplayText(
  text: string,
  language: 'en' | 'ar' = 'en',
): string {
  if (!text) return '';

  const arabicMatch = ARABIC_CHAR.exec(text);
  if (!arabicMatch || arabicMatch.index === undefined) {
    return text;
  }

  const splitAt = arabicMatch.index;
  if (language === 'ar') {
    return text.slice(splitAt).replace(/^\s*\/\s*/, '').trim() || text;
  }

  const english = text.slice(0, splitAt).replace(/\s*\/\s*$/, '').trim();
  return english || text;
}
