import { describe, expect, it } from "vitest";
import type { QlooApi } from "./api";
import { normalizeName, resolveEntity, resolveTheme } from "./resolve";
import type { QlooEntity, QlooTag } from "./types";

const ok = <T>(data: T) => ({ status: "ok" as const, data, call: {} as never });
const entity = (name: string, popularity: number, type = "urn:entity:tv_show"): QlooEntity => ({
  id: `${name}-${popularity}`,
  name,
  type,
  popularity,
  tags: [],
});
const fakeApi = (opts: { search?: QlooEntity[]; tags?: QlooTag[] }) =>
  ({
    search: async () => ok(opts.search ?? []),
    findTags: async () => ok(opts.tags ?? []),
  }) as unknown as QlooApi;

describe("normalizeName", () => {
  it("ignores case, accents, Turkish dotless i, ß, & and punctuation", () => {
    expect(normalizeName("Bon Appétit")).toBe(normalizeName("bon appetit"));
    expect(normalizeName("Altın Gün")).toBe(normalizeName("Altin Gun"));
    expect(normalizeName("Straße")).toBe("strasse");
    expect(normalizeName("Salt & Pepper")).toBe("salt and pepper");
    expect(normalizeName("Fred again..")).toBe("fred again");
  });
});

describe("resolveEntity", () => {
  it("confirms a single exact match of the requested type", async () => {
    const api = fakeApi({ search: [entity("The Bear", 0.99), entity("The Bear Grylls Show", 0.5)] });
    expect(await resolveEntity(api, "the bear", "urn:entity:tv_show")).toMatchObject({ status: "confirmed", name: "The Bear" });
  });

  it("does not confirm a fuzzy near-miss", async () => {
    const api = fakeApi({ search: [entity("Toronto Blue Jays", 0.99, "urn:entity:brand")] });
    expect((await resolveEntity(api, "Blue Bottle Coffee", "urn:entity:brand")).status).toBe("needs_input");
  });

  it("ignores exact names of the wrong type", async () => {
    const api = fakeApi({ search: [entity("Chef", 0.99, "urn:entity:movie")] });
    expect((await resolveEntity(api, "Chef", "urn:entity:tv_show")).status).toBe("needs_input");
  });

  it("picks a clearly dominant duplicate and asks when duplicates are close or obscure", async () => {
    const dominant = fakeApi({ search: [entity("The Office", 0.999), entity("The Office", 0.7)] });
    expect(await resolveEntity(dominant, "The Office", "urn:entity:tv_show")).toMatchObject({ status: "confirmed", id: "The Office-0.999" });

    const close = fakeApi({ search: [entity("Euphoria", 0.95), entity("Euphoria", 0.93)] });
    expect((await resolveEntity(close, "Euphoria", "urn:entity:tv_show")).status).toBe("needs_input");

    const obscure = fakeApi({ search: [entity("Making It", 0.39), entity("Making It", 0.2)] });
    const res = await resolveEntity(obscure, "Making It", "urn:entity:tv_show");
    expect(res.status).toBe("needs_input");
    expect(res.candidates).toHaveLength(2);
  });

  it("reports not_found when search returns nothing", async () => {
    expect((await resolveEntity(fakeApi({}), "Nothing", "urn:entity:brand")).status).toBe("not_found");
  });
});

describe("resolveTheme", () => {
  const tag = (name: string, ns: string): QlooTag => ({ id: `urn:tag:${ns}:qloo:${name}`, name, subtype: `urn:tag:${ns}:qloo`, parentTypes: [] });

  it("requires an exact tag name and prefers lifestyle over hobby", async () => {
    const api = fakeApi({ tags: [tag("Photography", "hobby"), tag("Photography", "lifestyle"), tag("Photographer", "hobby")] });
    expect(await resolveTheme(api, "photography")).toMatchObject({ status: "confirmed", type: "urn:tag:lifestyle:qloo" });
  });

  it("returns candidates instead of guessing", async () => {
    const api = fakeApi({ tags: [tag("DIY Projects", "lifestyle"), tag("craftsman", "hobby")] });
    const res = await resolveTheme(api, "woodworking");
    expect(res.status).toBe("needs_input");
    expect(res.candidates.map((c) => c.name)).toEqual(["DIY Projects", "craftsman"]);
  });
});
