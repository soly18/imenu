// Latin digits in every language (Arabic locales would otherwise show Arabic-Indic digits,
// which is confusing on a till where amounts are compared with printed receipts).
const locale = (lng: string) => `${lng}-u-nu-latn`;

export function fmtMoney(value: number, lng: string, currency = '₪'): string {
  const abs = new Intl.NumberFormat(locale(lng), {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value < 0 ? '-' : ''}${currency}${abs}`;
}

export function fmtDateTime(iso: string, lng: string): string {
  try {
    return new Date(iso).toLocaleString(locale(lng), { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
