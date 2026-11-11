/**
 * Menu data (groups, items, choices) has its own names per language, not UI strings:
 *   he = namePrimary (local language) · en = nameSecondary · ar = nameAr · ru = nameRu.
 * Falls back to English, then the primary name, so nothing is ever blank.
 */
export interface Named { namePrimary: string; nameSecondary?: string | null; nameAr?: string | null; nameRu?: string | null }

export function localName(o: Named | null | undefined, lang: string): string {
  if (!o) return '';
  const l = (lang || 'he').slice(0, 2);
  if (l === 'ar') return o.nameAr || o.nameSecondary || o.namePrimary;
  if (l === 'ru') return o.nameRu || o.nameSecondary || o.namePrimary;
  if (l === 'en') return o.nameSecondary || o.namePrimary;
  return o.namePrimary;
}
