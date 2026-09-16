import type { FarmReport, LocationMatch } from "./types";

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
    const message = await response.text();
    throw new Error(message || "Farm intelligence could not be loaded.");
  }
  return response.json() as Promise<FarmReport>;
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
