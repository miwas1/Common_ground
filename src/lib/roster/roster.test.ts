import { describe, expect, it } from "vitest";
import { cleanHandle, parseCountry, parseCsv, parseMoney, rowsToRoster } from "./csv";
import { audienceLean, describeLean, leanMatchesIntended, occupationLabel } from "./qloo";

describe("CSV import", () => {
  it("reads quoted fields, doubled quotes and line breaks inside quotes", () => {
    expect(parseCsv('name,notes\r\n"Rivera, Sam","Said ""yes""\nby email"\n\n')).toEqual([
      ["name", "notes"],
      ["Rivera, Sam", 'Said "yes"\nby email'],
    ]);
  });

  it("maps flexible column names and normalises handles, countries and rates", () => {
    const { entries, problems } = rowsToRoster(
      parseCsv(
        [
          "Creator Name,IG Handle,Country,Fee,Currency,Availability,Preferred,Work type",
          "Claire Saffitz,https://www.instagram.com/csaffitz/,USA,,,available,yes,content",
          "Sam Rivera,@SamCooks,uk,£1.2k,,booked,,both",
        ].join("\n"),
      ),
    );
    expect(problems).toEqual([]);
    expect(entries[0]).toMatchObject({ name: "Claire Saffitz", instagram: "csaffitz", country: "US", availability: "available", preferred: true, modes: ["ugc_production"] });
    expect(entries[0].rate).toBeUndefined();
    expect(entries[1]).toMatchObject({ instagram: "samcooks", country: "GB", availability: "booked", rate: { amountCents: 120_000, currency: "GBP" } });
    expect(entries[1].modes).toEqual(["ugc_production", "creator_distribution"]);
  });

  it("reports what it can't read instead of guessing", () => {
    const { entries, problems } = rowsToRoster(parseCsv("name,country,rate\n,US,100\nAna,Narnia,lots"));
    expect(entries.map((e) => e.name)).toEqual(["Ana"]);
    expect(problems.map((p) => p.line)).toEqual([2, 3, 3]);
    expect(rowsToRoster(parseCsv("handle\n@x")).problems[0].message).toMatch(/name/);
  });

  it("parses money, handles and countries", () => {
    expect(parseMoney("$1,500")).toEqual({ amountCents: 150_000, currency: "USD" });
    expect(parseMoney("900 EUR")).toEqual({ amountCents: 90_000, currency: "EUR" });
    expect(parseMoney("tbc")).toBeUndefined();
    expect(cleanHandle("instagram.com/some.creator?hl=en")).toBe("some.creator");
    expect(cleanHandle("not a handle!")).toBeUndefined();
    expect(parseCountry("Germany")).toBe("DE");
  });
});

describe("creator audiences from Qloo", () => {
  const audience = { age: { "24_and_younger": -0.3, "30_to_34": 0.12, "35_to_44": 0.36 }, gender: { male: -0.63, female: 0.63 } };

  it("describes the lean: up to two over-indexed age bands and a gender skew", () => {
    const lean = audienceLean(audience);
    expect(lean).toEqual({ ages: ["35_to_44", "30_to_34"], gender: "female" });
    expect(describeLean(lean)).toBe("ages 35–44, 30–34 · female");
    expect(describeLean(audienceLean({ age: {}, gender: {} }))).toBe("No clear age or gender lean");
  });

  it("compares the lean with the ages a brief is aiming at, and says nothing when either is unknown", () => {
    const lean = audienceLean(audience);
    expect(leanMatchesIntended(lean, ["30_to_34"])).toBe(true);
    expect(leanMatchesIntended(lean, ["24_and_younger"])).toBe(false);
    expect(leanMatchesIntended(lean, [])).toBeNull();
    expect(leanMatchesIntended(null, ["30_to_34"])).toBeNull();
  });

  it("names occupations plainly", () => {
    expect(occupationLabel("youtuber")).toBe("YouTuber");
    expect(occupationLabel("pastry_chef")).toBe("Pastry chef");
  });
});
