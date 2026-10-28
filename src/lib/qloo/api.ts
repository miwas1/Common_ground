// Typed operations over the Qloo endpoints Common Ground uses.
// Parameter names follow docs.qloo.com; behaviour notes come from live probing (PLAN.md §1).

import type { QlooClient, QlooParams, QlooResult } from "./client";
import {
  trimAudiences,
  trimCompare,
  trimDemographics,
  trimEntities,
  trimHeatmap,
  trimInsightsEntities,
  trimSearch,
  trimTags,
  trimTagTypes,
  trimTrending,
} from "./trim";
import type {
  CompareResult,
  DemographicSkew,
  HeatmapCell,
  InsightsEntities,
  QlooAudience,
  QlooEntity,
  QlooEntityType,
  QlooTag,
  TrendPoint,
} from "./types";

/** The taste profile a request is about. Signals shape affinity; they do not filter. */
export type TasteSignals = {
  entities?: string[];
  tags?: string[];
  audiences?: string[];
  ageBands?: string[];
  gender?: "male" | "female";
  /** Fuzzy locality name, e.g. "London". Biases results toward that place's taste. */
  location?: string;
  entityWeight?: number | "low" | "medium" | "high";
  tagWeight?: number | "low" | "medium" | "high";
};

function signalParams(s: TasteSignals): QlooParams {
  return {
    "signal.interests.entities": s.entities,
    "signal.interests.tags": s.tags,
    "signal.demographics.audiences": s.audiences,
    "signal.demographics.age": s.ageBands,
    "signal.demographics.gender": s.gender,
    "signal.location.query": s.location,
    "signal.interests.entities.weight": s.entityWeight,
    "signal.interests.tags.weight": s.tagWeight,
  };
}

const hasSignal = (s: TasteSignals) =>
  Boolean(s.entities?.length || s.tags?.length || s.audiences?.length || s.location);

function requireSignal(s: TasteSignals, op: string) {
  if (!hasSignal(s)) throw new Error(`${op}: at least one entity, tag, audience or location signal is required`);
}

export class QlooApi {
  constructor(private readonly client: QlooClient) {}

  /** Name → candidate entities. Fuzzy: always confirm ambiguous matches with the user. */
  search(input: { query: string; types?: QlooEntityType[]; take?: number }): Promise<QlooResult<QlooEntity[]>> {
    return this.client.get(
      "/search",
      { query: input.query, types: input.types, take: input.take ?? 5 },
      trimSearch,
      (d) => d.length === 0,
    );
  }

  /** Qloo IDs → entities. */
  entities(ids: string[]): Promise<QlooResult<QlooEntity[]>> {
    return this.client.get("/entities", { entity_ids: ids }, trimEntities, (d) => d.length === 0);
  }

  /** Concept → tag URNs via semantic search over Qloo's tag ontology. */
  findTags(input: {
    query: string;
    take?: number;
    tagTypes?: string[];
    parentTypes?: QlooEntityType[];
  }): Promise<QlooResult<QlooTag[]>> {
    return this.client.get(
      "/v2/tags",
      {
        "filter.query": input.query,
        "feature.semantic_search": true,
        "filter.tag.types": input.tagTypes,
        "filter.parents.types": input.parentTypes,
        take: input.take ?? 10,
      },
      trimTags,
      (d) => d.length === 0,
    );
  }

  /** Tag namespaces available for an entity type (e.g. lifestyle, aesthetic_property for brands). */
  tagTypes(parentTypes: QlooEntityType[]): Promise<QlooResult<string[]>> {
    return this.client.get(
      "/v2/tags/types",
      { "filter.parents.types": parentTypes, take: 50 },
      trimTagTypes,
      (d) => d.length === 0,
    );
  }

  /** Free text → audience segment URNs (e.g. "coffee" → urn:audience:leisure:coffee). */
  findAudiences(input: { query: string; take?: number }): Promise<QlooResult<QlooAudience[]>> {
    return this.client.get(
      "/v2/audiences",
      { "filter.query": input.query, take: input.take ?? 10 },
      trimAudiences,
      (d) => d.length === 0,
    );
  }

  /**
   * Cross-domain recommendations: entities of `type` with the strongest affinity to the signals.
   * Explainability is on by default; it is only informative with two or more seed entities.
   */
  recommend(input: {
    type: QlooEntityType;
    signals: TasteSignals;
    take?: number;
    explain?: boolean;
    /** Constrain output to a place, e.g. local venues in "London". */
    inLocation?: string;
    tags?: string[];
    excludeTags?: string[];
    excludeEntities?: string[];
    popularityMin?: number;
  }): Promise<QlooResult<InsightsEntities>> {
    requireSignal(input.signals, "recommend");
    return this.client.get(
      "/v2/insights",
      {
        "filter.type": input.type,
        ...signalParams(input.signals),
        "filter.location.query": input.inLocation,
        "filter.tags": input.tags,
        "filter.exclude.tags": input.excludeTags,
        "filter.exclude.entities": input.excludeEntities,
        "filter.popularity.min": input.popularityMin,
        "feature.explainability": input.explain ?? true,
        take: input.take ?? 10,
      },
      trimInsightsEntities,
      (d) => d.entities.length === 0,
    );
  }

  /**
   * Score a specific list of entities against a taste profile (`filter.results.entities`).
   * Used to measure how well a creator's public references fit a campaign direction.
   * Entities missing from the result had no measurable affinity.
   */
  scoreEntities(input: {
    type: QlooEntityType;
    signals: TasteSignals;
    entityIds: string[];
  }): Promise<QlooResult<InsightsEntities>> {
    requireSignal(input.signals, "scoreEntities");
    return this.client.get(
      "/v2/insights",
      {
        "filter.type": input.type,
        ...signalParams(input.signals),
        "filter.results.entities": input.entityIds,
        take: input.entityIds.length,
      },
      trimInsightsEntities,
      (d) => d.entities.length === 0,
    );
  }

  /**
   * Taste analysis (`filter.type=urn:tag`): the concepts that characterise a profile.
   * Note: combining this with a location signal returned nothing in testing — localise with
   * `recommend({ inLocation })` and heatmaps instead.
   */
  tasteProfile(input: {
    signals: TasteSignals;
    tagTypes?: string[];
    parentTypes?: QlooEntityType[];
    /** Score only these tags (`filter.results.tags`). */
    scoreTags?: string[];
    take?: number;
  }): Promise<QlooResult<QlooTag[]>> {
    requireSignal(input.signals, "tasteProfile");
    return this.client.get(
      "/v2/insights",
      {
        "filter.type": "urn:tag",
        ...signalParams(input.signals),
        "filter.tag.types": input.tagTypes,
        "filter.parents.types": input.parentTypes,
        "filter.results.tags": input.scoreTags,
        take: input.scoreTags?.length ?? input.take ?? 15,
      },
      trimTags,
      (d) => d.length === 0,
    );
  }

  /** Aggregate age/gender skew for each entity and tag given (one row per subject). */
  demographics(input: { entities?: string[]; tags?: string[] }): Promise<QlooResult<DemographicSkew[]>> {
    requireSignal({ entities: input.entities, tags: input.tags }, "demographics");
    return this.client.get(
      "/v2/insights",
      {
        "filter.type": "urn:demographics",
        "signal.interests.entities": input.entities,
        "signal.interests.tags": input.tags,
      },
      trimDemographics,
      (d) => d.length === 0,
    );
  }

  /** Geohash grid of affinity across an area. Locality boundaries are deliberately not used. */
  heatmap(input: { area: string; signals: TasteSignals }): Promise<QlooResult<HeatmapCell[]>> {
    requireSignal(input.signals, "heatmap");
    return this.client.get(
      "/v2/insights",
      { "filter.type": "urn:heatmap", "filter.location.query": input.area, ...signalParams(input.signals) },
      trimHeatmap,
      (d) => d.length === 0,
    );
  }

  /** Weekly popularity series for entities of one type over an ISO date range. */
  trending(input: {
    type: QlooEntityType;
    entityIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<QlooResult<TrendPoint[]>> {
    return this.client.get(
      "/v2/trending",
      {
        "filter.type": input.type,
        "signal.interests.entities": input.entityIds,
        "filter.start_date": input.startDate,
        "filter.end_date": input.endDate,
      },
      trimTrending,
      (d) => d.length === 0,
    );
  }

  /** Tags shared by, and distinctive to, two groups of entities. */
  compare(input: { groupA: string[]; groupB: string[] }): Promise<QlooResult<CompareResult>> {
    return this.client.get(
      "/v2/analysis/compare",
      { "a.signal.interests.entities": input.groupA, "b.signal.interests.entities": input.groupB },
      trimCompare,
      (d) => d.shared.length + d.onlyA.length + d.onlyB.length === 0,
    );
  }
}
