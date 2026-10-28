// Quotes arrive in USD, GBP and EUR; budgets are in the campaign currency.
// Conversions use fixed, indicative rates and are always labelled as such in the UI.

export const INDICATIVE_FX_DATE = "2026-10-01";
const USD_PER: Record<string, number> = { USD: 1, GBP: 1.27, EUR: 1.08 };

export function convertCents(amountCents: number, from: string, to: string): number {
  const f = USD_PER[from];
  const t = USD_PER[to];
  if (!f || !t) throw new Error(`No indicative rate for ${from}→${to}`);
  return Math.round((amountCents * f) / t);
}

export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountCents / 100);
}
