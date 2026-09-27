import type {
  Catalog,
  ComparisonRequest,
  ComparisonResponse,
  ScenarioOut,
  SensitivityRequest,
  SensitivityResponse,
  SourcesStatus,
} from "@sim/contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail))
        msg = body.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.slice(1).join(".")}: ${d.msg}`).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  catalog: () => call<Catalog>("/catalog"),
  compare: (req: ComparisonRequest, signal?: AbortSignal) =>
    call<ComparisonResponse>("/comparisons", { method: "POST", body: JSON.stringify(req), signal }),
  sensitivity: (req: SensitivityRequest, signal?: AbortSignal) =>
    call<SensitivityResponse>("/analyses/sensitivity", { method: "POST", body: JSON.stringify(req), signal }),
  saveScenario: (comparison_id: string, sensitivity_id?: string | null, label?: string) =>
    call<ScenarioOut>("/scenarios", {
      method: "POST",
      body: JSON.stringify({ comparison_id, sensitivity_id: sensitivity_id ?? null, label: label ?? null }),
    }),
  scenario: (id: string) => call<ScenarioOut>(`/scenarios/${encodeURIComponent(id)}`),
  sources: (refresh = false) => call<SourcesStatus>(`/sources/status${refresh ? "?refresh=true" : ""}`),
};

export const exportUrl = (id: string, format: "csv" | "json") =>
  `/api/v1/scenarios/${encodeURIComponent(id)}/export?format=${format}`;
