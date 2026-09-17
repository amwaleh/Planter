import type {
  CropRule,
  CropRuleInput,
  CropCatalogItem,
  CropImageMetadata,
  AssistantResponse,
  FarmProject,
  FarmProjectInput,
  FarmReport,
  EnsoTracker,
  LocationMatch,
  LandIntelligence,
  LivestockReport,
  MapLinkResolution,
  ProviderHealth,
  WaterIntelligence,
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

export async function getEnsoTracker(): Promise<EnsoTracker> {
  const response = await fetch(`${API_BASE_URL}/api/v1/enso`);
  if (!response.ok) {
    throw new Error("Seasonal ENSO context could not be loaded.");
  }
  return response.json() as Promise<EnsoTracker>;
}

export async function searchLocations(query: string): Promise<LocationMatch[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/locations?${new URLSearchParams({ query })}`,
  );
  if (!response.ok) {
    throw new Error("Eastern Africa place search is temporarily unavailable.");
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

export async function updateProject(
  projectId: string,
  project: FarmProjectInput,
): Promise<FarmProject> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { detail?: string };
    throw new Error(payload.detail ?? "The farm project could not be updated.");
  }
  return response.json() as Promise<FarmProject>;
}

export async function getCropRules(): Promise<CropRule[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/crop-rules`);
  if (!response.ok) throw new Error("Crop rules could not be loaded.");
  return response.json() as Promise<CropRule[]>;
}

export async function getCropCatalog(): Promise<CropCatalogItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/crop-catalog`);
  if (!response.ok) throw new Error("The East African crop catalog could not be loaded.");
  return response.json() as Promise<CropCatalogItem[]>;
}

export async function getCropImage(
  name: string,
  title: string,
): Promise<CropImageMetadata> {
  const query = new URLSearchParams({ name, title });
  const response = await fetch(`${API_BASE_URL}/api/v1/crop-image?${query}`);
  if (!response.ok) {
    const error = new Error("No reusable crop image was found.") as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<CropImageMetadata>;
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

export async function getWaterIntelligence(
  latitude: number,
  longitude: number,
): Promise<WaterIntelligence> {
  const query = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });
  const response = await fetch(`${API_BASE_URL}/api/v1/water-intelligence?${query}`);
  if (!response.ok) throw new Error("Water intelligence could not be loaded.");
  return response.json() as Promise<WaterIntelligence>;
}

export async function getLandIntelligence(
  latitude: number,
  longitude: number,
): Promise<LandIntelligence> {
  const query = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });
  const response = await fetch(`${API_BASE_URL}/api/v1/land-intelligence?${query}`);
  if (!response.ok) throw new Error("Soil and terrain intelligence could not be loaded.");
  return response.json() as Promise<LandIntelligence>;
}

export async function getLivestockReport(
  latitude: number,
  longitude: number,
): Promise<LivestockReport> {
  const query = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });
  const response = await fetch(`${API_BASE_URL}/api/v1/livestock?${query}`);
  if (!response.ok) throw new Error("Livestock guidance could not be loaded.");
  return response.json() as Promise<LivestockReport>;
}

export async function askFarmAssistant(
  latitude: number,
  longitude: number,
  crop: string,
  question: string,
): Promise<AssistantResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude, crop, question }),
  });
  if (!response.ok) throw new Error("The farm assistant could not answer.");
  return response.json() as Promise<AssistantResponse>;
}

export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/provider-health`);
  if (!response.ok) throw new Error("Provider health could not be loaded.");
  return response.json() as Promise<ProviderHealth[]>;
}
