// Pure functions that reduce raw Qloo JSON to the shapes in ./types.
// Every field is read defensively: the API omits fields freely and returns nulls.

import type {
  AgeBand,
  AggregateAttribution,
  Attribution,
  CompareResult,
  CompareTag,
  DemographicSkew,
  HeatmapCell,
  InsightsEntities,
  QlooAudience,
  QlooEntity,
  QlooTag,
  QlooTagRef,
  TrendPoint,
} from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

const compact = <T>(items: (T | undefined)[]): T[] => items.filter((i): i is T => i !== undefined);

const MAX_TAGS_PER_ENTITY = 8;

function attributions(v: unknown): Attribution[] {
  return arr(v)
    .map((a) => ({ entityId: str(obj(a).entity_id), score: num(obj(a).score ?? obj(a).avg_score) }))
    .filter((a): a is Attribution => a.entityId !== undefined && a.score !== undefined);
}

function tagRefs(v: unknown): QlooTagRef[] {
  return compact(
    arr(v).map((t): QlooTagRef | undefined => {
      const id = str(obj(t).id ?? obj(t).tag_id);
      const name = str(obj(t).name);
      return id && name ? { id, name, type: str(obj(t).type) } : undefined;
    }),
  ).slice(0, MAX_TAGS_PER_ENTITY);
}

export function trimEntity(raw: unknown): QlooEntity | undefined {
  const e = obj(raw);
  const id = str(e.entity_id);
  const name = str(e.name);
  if (!id || !name) return undefined;

  const props = obj(e.properties);
  const query = obj(e.query);
  const type = str(e.subtype) ?? str(arr(e.types)[0]) ?? str(e.type) ?? "urn:entity";
  const shortDescription = str(obj(arr(props.short_descriptions)[0]).value);
  const imageUrl = str(obj(props.image).url) ?? str(obj(arr(props.images)[0]).url);

  const entity: QlooEntity = {
    id,
    name,
    type,
    disambiguation: str(e.disambiguation),
    description: shortDescription ?? str(props.description),
    imageUrl,
    popularity: num(e.popularity),
    affinity: num(query.affinity),
    tags: tagRefs(e.tags),
  };

  const attribution = attributions(obj(query.explainability)["signal.interests.entities"]);
  if (attribution.length > 0) entity.attribution = attribution;

  if (type === "urn:entity:place") {
    const geocode = obj(props.geocode);
    const location = obj(e.location);
    entity.place = {
      address: str(props.address),
      city: str(geocode.city),
      country: str(geocode.country_code) ?? str(geocode.country),
      neighborhood: str(props.neighborhood),
      priceLevel: num(props.price_level),
      businessRating: num(props.business_rating),
      lat: num(location.lat),
      lon: num(location.lon),
    };
  }
  return entity;
}

const entities = (v: unknown): QlooEntity[] =>
  arr(v).map(trimEntity).filter((e): e is QlooEntity => e !== undefined);

/** `/search` → `results[]` */
export function trimSearch(raw: unknown): QlooEntity[] {
  return entities(obj(raw).results);
}

/** `/entities` → `results[]` (some deployments nest under `results.entities`) */
export function trimEntities(raw: unknown): QlooEntity[] {
  const results = obj(raw).results;
  return entities(Array.isArray(results) ? results : obj(results).entities);
}

function aggregateAttribution(raw: unknown): AggregateAttribution | undefined {
  const byInput = obj(obj(obj(obj(raw).query).explainability)["signal.interests.entities"]);
  if (Object.keys(byInput).length === 0) return undefined;
  return {
    top3: attributions(byInput.effect_on_top3_recs),
    top10: attributions(byInput.effect_on_top10_recs),
    all: attributions(byInput.effect_on_all_recs),
  };
}

/** `/v2/insights` with an entity `filter.type` → `results.entities[]` */
export function trimInsightsEntities(raw: unknown): InsightsEntities {
  const result: InsightsEntities = { entities: entities(obj(obj(raw).results).entities) };
  const attribution = aggregateAttribution(raw);
  if (attribution) result.attribution = attribution;
  return result;
}

function trimTag(raw: unknown): QlooTag | undefined {
  const t = obj(raw);
  const id = str(t.tag_id) ?? str(t.id);
  const name = str(t.name);
  if (!id || !name) return undefined;
  const parentTypes = [
    ...arr(t.types).map(str),
    ...arr(t.parents).map((p) => str(obj(p).type)),
  ].filter((p): p is string => p !== undefined);
  return {
    id,
    name,
    subtype: str(t.subtype) ?? str(t.type),
    parentTypes: [...new Set(parentTypes)],
    popularity: num(t.popularity),
    affinity: num(obj(t.query).affinity),
  };
}

/** `/v2/tags` and `/v2/insights?filter.type=urn:tag` → `results.tags[]` */
export function trimTags(raw: unknown): QlooTag[] {
  return arr(obj(obj(raw).results).tags)
    .map(trimTag)
    .filter((t): t is QlooTag => t !== undefined);
}

/** `/v2/tags/types` → list of tag namespaces */
export function trimTagTypes(raw: unknown): string[] {
  return arr(obj(obj(raw).results).tag_types)
    .map((t) => str(obj(t).type))
    .filter((t): t is string => t !== undefined);
}

/** `/v2/audiences` → `results.audiences[]` */
export function trimAudiences(raw: unknown): QlooAudience[] {
  return compact(
    arr(obj(obj(raw).results).audiences).map((a): QlooAudience | undefined => {
      const o = obj(a);
      const id = str(o.id);
      const name = str(o.name);
      if (!id || !name) return undefined;
      return { id, name, type: str(o.type) ?? "urn:audience", disambiguation: str(o.disambiguation) };
    }),
  );
}

const AGE_BANDS: AgeBand[] = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
];

/** `/v2/insights?filter.type=urn:demographics` → `results.demographics[]` */
export function trimDemographics(raw: unknown): DemographicSkew[] {
  return arr(obj(obj(raw).results).demographics)
    .map((d) => {
      const o = obj(d);
      const subjectId = str(o.entity_id);
      if (!subjectId) return undefined;
      const age = obj(obj(o.query).age);
      const gender = obj(obj(o.query).gender);
      const skew: DemographicSkew = { subjectId, age: {}, gender: {} };
      for (const band of AGE_BANDS) {
        const v = num(age[band]);
        if (v !== undefined) skew.age[band] = Math.round(v * 100) / 100;
      }
      const male = num(gender.male);
      const female = num(gender.female);
      if (male !== undefined) skew.gender.male = Math.round(male * 100) / 100;
      if (female !== undefined) skew.gender.female = Math.round(female * 100) / 100;
      return skew;
    })
    .filter((d): d is DemographicSkew => d !== undefined);
}

/** `/v2/insights?filter.type=urn:heatmap` → `results.heatmap[]` (geohash grid only) */
export function trimHeatmap(raw: unknown): HeatmapCell[] {
  return arr(obj(obj(raw).results).heatmap)
    .map((c) => {
      const location = obj(obj(c).location);
      const query = obj(obj(c).query);
      const cell = {
        geohash: str(location.geohash),
        lat: num(location.latitude),
        lon: num(location.longitude),
        affinity: num(query.affinity),
        affinityRank: num(query.affinity_rank),
        popularity: num(query.popularity),
      };
      return Object.values(cell).every((v) => v !== undefined) ? (cell as HeatmapCell) : undefined;
    })
    .filter((c): c is HeatmapCell => c !== undefined);
}

/** `/v2/trending` → `results.trending[]`, oldest first */
export function trimTrending(raw: unknown): TrendPoint[] {
  return arr(obj(obj(raw).results).trending)
    .map((p) => {
      const o = obj(p);
      const date = str(o.date);
      if (!date) return undefined;
      return {
        date,
        populationPercentile: num(o.population_percentile) ?? 0,
        populationRank: num(o.population_rank) ?? 0,
        rankVelocity: num(o.population_rank_velocity) ?? 0,
        percentDelta: num(o.population_percent_delta) ?? 0,
      };
    })
    .filter((p): p is TrendPoint => p !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function compareTags(v: unknown): CompareTag[] {
  return compact(
    arr(v).map((t): CompareTag | undefined => {
      const o = obj(t);
      const id = str(o.tag_id) ?? str(o.id);
      const name = str(o.name);
      if (!id || !name) return undefined;
      return { id, name, subtype: str(o.subtype), popularity: num(o.popularity), count: num(obj(o.query).count) };
    }),
  );
}

/** `/v2/analysis/compare` → shared tags plus tags distinctive to each group */
export function trimCompare(raw: unknown): CompareResult {
  const results = obj(obj(raw).results);
  return { shared: compareTags(results.tags), onlyA: compareTags(results.a), onlyB: compareTags(results.b) };
}
