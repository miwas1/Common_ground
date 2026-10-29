// Trimmed shapes of Qloo responses. Raw responses are 10–250 KB; these keep only
// what the product and the agent use, so they are cheap to cache and to put in prompts.

export type QlooEntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:locality"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:videogame";

export type QlooTagRef = { id: string; name: string; type?: string };

/** Per-input attribution from `feature.explainability=true` (0–1, sums to ~1). */
export type Attribution = { entityId: string; score: number };

export type QlooEntity = {
  id: string;
  name: string;
  /** e.g. "urn:entity:artist" */
  type: string;
  disambiguation?: string;
  description?: string;
  imageUrl?: string;
  popularity?: number;
  affinity?: number;
  attribution?: Attribution[];
  tags: QlooTagRef[];
  /** people only: public social handles Qloo links to the person (without "@"). */
  handles?: { instagram?: string; twitter?: string };
  /** people only: occupations, e.g. "youtuber", "pastry_chef" (urn:tag:occupation:person:*). */
  occupations?: string[];
  /** people only: Qloo records a date of death. */
  deceased?: boolean;
  /** places only */
  place?: {
    address?: string;
    city?: string;
    country?: string;
    neighborhood?: string;
    priceLevel?: number;
    businessRating?: number;
    lat?: number;
    lon?: number;
  };
};

export type QlooTag = {
  id: string;
  name: string;
  /** tag namespace, e.g. "urn:tag:lifestyle:qloo" */
  subtype?: string;
  parentTypes: string[];
  popularity?: number;
  affinity?: number;
};

export type QlooAudience = {
  id: string;
  name: string;
  type: string;
  disambiguation?: string;
};

export type AgeBand =
  | "24_and_younger"
  | "25_to_29"
  | "30_to_34"
  | "35_to_44"
  | "45_to_54"
  | "55_and_older";

/** Relative skew vs average: positive = over-indexes, negative = under-indexes. */
export type DemographicSkew = {
  subjectId: string;
  age: Partial<Record<AgeBand, number>>;
  gender: { male?: number; female?: number };
};

export type HeatmapCell = {
  geohash: string;
  lat: number;
  lon: number;
  affinity: number;
  affinityRank: number;
  popularity: number;
};

export type TrendPoint = {
  date: string;
  populationPercentile: number;
  populationRank: number;
  rankVelocity: number;
  percentDelta: number;
};

export type CompareTag = {
  id: string;
  name: string;
  subtype?: string;
  popularity?: number;
  count?: number;
};

export type CompareResult = {
  shared: CompareTag[];
  onlyA: CompareTag[];
  onlyB: CompareTag[];
};

/** Aggregate explainability: average influence of each input across the top-N results. */
export type AggregateAttribution = {
  top3: Attribution[];
  top10: Attribution[];
  all: Attribution[];
};

export type InsightsEntities = {
  entities: QlooEntity[];
  attribution?: AggregateAttribution;
};
