import type {
  CropRule,
  CropRuleInput,
  FarmProject,
  FarmProjectInput,
  FarmReport,
  LocationMatch,
  MapLinkResolution,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function getFarmReport(
  latitude: number,
  longitude: number,
  crop: string,
): Promise<FarmReport> {
  const query = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    crop,
  });
  const response = await fetch(`${API_BASE_URL}/api/v1/farm-report?${query}`);
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail ?? "Farm intelligence could not be loaded.");
  }
  return response.json() as Promise<FarmReport>;
}

export async function getCrops(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/crops`);
  if (!response.ok) {
    throw new Error("The crop catalog could not be loaded.");
  }
  return response.json() as Promise<string[]>;
}

export async function searchLocations(query: string): Promise<LocationMatch[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/locations?${new URLSearchParams({ query })}`,
  );
  if (!response.ok) {
    throw new Error("Kenyan place search is temporarily unavailable.");
  }
  return response.json() as Promise<LocationMatch[]>;
}

export async function resolveMapLink(link: string): Promise<MapLinkResolution> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/resolve-map-link?${new URLSearchParams({ link })}`,
  );
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail ?? "The Google Maps link could not be resolved.");
  }
  return response.json() as Promise<MapLinkResolution>;
}

export async function getProjects(): Promise<FarmProject[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects`);
  if (!response.ok) throw new Error("Saved farms could not be loaded.");
  return response.json() as Promise<FarmProject[]>;
}

export async function createProject(
  project: FarmProjectInput,
): Promise<FarmProject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail ?? "The farm project could not be saved.");
  }
  return response.json() as Promise<FarmProject>;
}

export async function getCropRules(): Promise<CropRule[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/crop-rules`);
  if (!response.ok) throw new Error("Crop rules could not be loaded.");
  return response.json() as Promise<CropRule[]>;
}

export async function createCropRule(rule: CropRuleInput): Promise<CropRule> {
  const response = await fetch(`${API_BASE_URL}/api/v1/crop-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail ?? "The crop rule could not be saved.");
  }
  return response.json() as Promise<CropRule>;
}
