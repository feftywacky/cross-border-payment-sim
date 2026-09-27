import type { components, paths } from "./schema";

export type { components, paths };
type S = components["schemas"];

export type Catalog = S["CatalogOut"];
export type ComparisonRequest = S["ComparisonRequest"];
export type ComparisonResponse = S["ComparisonResponse"];
export type Overrides = S["Overrides"];
export type RouteResult = S["RouteResult"];
export type LegResult = S["LegResult"];
export type FeeItem = S["FeeItem"];
export type Duration = S["Duration"];
export type ReferenceFx = S["ReferenceFx"];
export type SensitivityRequest = S["SensitivityRequest"];
export type SensitivityResponse = S["SensitivityResponse"];
export type HeatmapCell = S["HeatmapCell"];
export type Series = S["Series"];
export type ScenarioOut = S["ScenarioOut"];
export type SourcesStatus = S["SourcesStatus"];
export type Observation = S["Observation"];
export type SourceStatus = Observation["status"];
export type Objective = ComparisonRequest["objective"];
