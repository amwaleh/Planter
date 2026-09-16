import type { FarmReport, LocationMatch, MapLinkResolution } from "./types";

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
