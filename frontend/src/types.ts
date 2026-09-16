export type Confidence = "High" | "Medium" | "Low";

export interface SourceRecord {
  provider: string;
  kind: "forecast" | "historical" | "modelled" | "derived" | "reference";
  retrieved_at: string;
  confidence: Confidence;
  limitations: string[];
}

export interface CurrentWeather {
  temperature_c: number;
  humidity_percent: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  weather_code: number;
}

export interface ClimateMonth {
  month: string;
  rainfall_mm: number;
  mean_temperature_c: number;
}

export interface OutlookSignal {
  label: string;
  level: "Favourable" | "Watch" | "Elevated";
  detail: string;
  confidence: Confidence;
}

export interface CropAssessment {
  crop: string;
  score: number;
  category: "Excellent" | "Good" | "Marginal" | "Poor";
  confidence: Confidence;
  reasons: string[];
  risks: string[];
  component_scores: Record<string, number>;
  planting_guidance: string;
  harvest_guidance: string;
  method: string;
}

export interface FarmReport {
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  current: CurrentWeather;
  climate: ClimateMonth[];
  outlook: OutlookSignal[];
  crop: CropAssessment;
  alternatives: CropAssessment[];
  sources: SourceRecord[];
  unavailable: { capability: string; reason: string }[];
}

export interface LocationMatch {
  name: string;
  admin1: string | null;
  admin2: string | null;
  latitude: number;
  longitude: number;
}
