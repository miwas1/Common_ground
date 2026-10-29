// Creator rosters arrive as spreadsheets. This reads a CSV export into roster entries: forgiving about
// column names and formats, strict about what it can't understand (reported per line, never guessed).

export type RosterInput = {
  name: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  email?: string;
  manager?: string;
  city?: string;
  /** Two-letter country code, e.g. US, GB, DE. */
  country?: string;
  languages?: string[];
  /** ugc_production | creator_distribution */
  modes?: string[];
  rate?: { amountCents: number; currency: string; package: string; usageTerms: string };
  availability?: "available" | "limited" | "booked";
  notes?: string;
  preferred?: boolean;
  portfolio?: { title: string; url: string }[];
};

/** RFC 4180-style parsing: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const COLUMNS: Record<string, keyof RosterInput | "currency" | "package" | "usage" | "work" | "portfolio_url" | "portfolio_title"> = {
  name: "name", creator: "name", "creator name": "name", "full name": "name", talent: "name",
  instagram: "instagram", ig: "instagram", "instagram handle": "instagram", handle: "instagram", "ig handle": "instagram",
  tiktok: "tiktok", "tiktok handle": "tiktok",
  youtube: "youtube", "youtube channel": "youtube",
  email: "email", "e-mail": "email", "contact email": "email",
  manager: "manager", agent: "manager", "manager email": "manager", agency: "manager",
  city: "city", location: "city",
  country: "country", market: "country",
  languages: "languages", language: "languages",
  rate: "rate", fee: "rate", price: "rate", "rate card": "rate", cost: "rate",
  currency: "currency",
  package: "package", deliverable: "package", deliverables: "package",
  usage: "usage", "usage rights": "usage", "usage terms": "usage",
  work: "work", "work type": "work", type: "work",
  availability: "availability", available: "availability",
  notes: "notes", note: "notes", comments: "notes",
  preferred: "preferred", favourite: "preferred", favorite: "preferred",
  portfolio: "portfolio_url", "portfolio url": "portfolio_url", "portfolio link": "portfolio_url", link: "portfolio_url", url: "portfolio_url",
  "portfolio title": "portfolio_title",
};

const COUNTRY: Record<string, string> = {
  us: "US", usa: "US", "united states": "US", "united states of america": "US", america: "US",
  gb: "GB", uk: "GB", "united kingdom": "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  de: "DE", germany: "DE", deutschland: "DE",
};

const SYMBOL: Record<string, string> = { $: "USD", "£": "GBP", "€": "EUR" };

/** "@handle", "instagram.com/handle/", "https://www.instagram.com/handle?x" → "handle" */
export function cleanHandle(v: string): string | undefined {
  const s = v
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok|youtube)\.com\//i, "")
    .replace(/^(www\.)?(instagram|tiktok|youtube)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .trim();
  return /^[A-Za-z0-9._-]{1,60}$/.test(s) ? s.toLowerCase() : undefined;
}

export function parseCountry(v: string): string | undefined {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  return COUNTRY[s] ?? (/^[a-z]{2}$/.test(s) ? s.toUpperCase() : undefined);
}

/** "$1,500", "1500 USD", "£900", "1.2k" → cents and currency. */
export function parseMoney(v: string, fallbackCurrency = "USD"): { amountCents: number; currency: string } | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const symbol = Object.keys(SYMBOL).find((k) => s.includes(k));
  const code = s.match(/\b(USD|GBP|EUR)\b/i)?.[1]?.toUpperCase();
  const num = s.replace(/[^\d.,k]/gi, "").replace(/,/g, "");
  const k = /k$/i.test(num);
  const amount = Number(num.replace(/k$/i, "")) * (k ? 1000 : 1);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amountCents: Math.round(amount * 100), currency: code ?? (symbol ? SYMBOL[symbol] : fallbackCurrency) };
}

const yes = (v: string) => /^(y|yes|true|1|x|preferred)$/i.test(v.trim());

export function rowsToRoster(rows: string[][]): { entries: RosterInput[]; problems: { line: number; message: string }[]; unknownColumns: string[] } {
  const problems: { line: number; message: string }[] = [];
  if (rows.length < 2) return { entries: [], problems: [{ line: 1, message: "Add a header row and at least one creator." }], unknownColumns: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[_*]+/g, " ").replace(/\s+/g, " "));
  const keys = header.map((h) => COLUMNS[h]);
  const unknownColumns = rows[0].filter((_, i) => !keys[i] && rows[0][i].trim());
  if (!keys.includes("name")) return { entries: [], problems: [{ line: 1, message: 'No "name" column. Name the column with each creator\'s name "name".' }], unknownColumns };

  const entries: RosterInput[] = [];
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (k: string) => {
      const idx = keys.indexOf(k as never);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    const name = get("name");
    if (!name) return problems.push({ line, message: "No name; row skipped." });
    const entry: RosterInput = { name };
    for (const k of ["instagram", "tiktok", "youtube"] as const) {
      const raw = get(k);
      if (!raw) continue;
      const h = cleanHandle(raw);
      if (h) entry[k] = h;
      else problems.push({ line, message: `Couldn't read the ${k} handle "${raw}"; left out.` });
    }
    if (get("email")) entry.email = get("email");
    if (get("manager")) entry.manager = get("manager");
    if (get("city")) entry.city = get("city");
    if (get("country")) {
      const c = parseCountry(get("country"));
      if (c) entry.country = c;
      else problems.push({ line, message: `Unknown country "${get("country")}"; use a two-letter code like US or GB.` });
    }
    if (get("languages")) entry.languages = get("languages").split(/[;,/|]/).map((l) => l.trim().toLowerCase().slice(0, 2)).filter(Boolean);
    const work = get("work").toLowerCase();
    if (work) entry.modes = /both|all/.test(work) ? ["ugc_production", "creator_distribution"] : /post|distribution|channel/.test(work) ? ["creator_distribution"] : ["ugc_production"];
    if (get("rate")) {
      const money = parseMoney(get("rate"), get("currency").toUpperCase() || "USD");
      if (money) entry.rate = { ...money, package: get("package") || "Standard package", usageTerms: get("usage") || "To agree" };
      else problems.push({ line, message: `Couldn't read the rate "${get("rate")}"; left as quote required.` });
    }
    const availability = get("availability").toLowerCase();
    if (availability) {
      if (/book|unavailable|^no$/.test(availability)) entry.availability = "booked";
      else if (/limit|partial|some/.test(availability)) entry.availability = "limited";
      else entry.availability = "available";
    }
    if (get("notes")) entry.notes = get("notes");
    if (get("preferred")) entry.preferred = yes(get("preferred"));
    const url = get("portfolio_url");
    if (url) entry.portfolio = [{ title: get("portfolio_title") || "Portfolio", url }];
    entries.push(entry);
  });
  return { entries, problems, unknownColumns };
}
