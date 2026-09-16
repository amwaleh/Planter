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
  requested_crop: string;
  crop_was_corrected: boolean;
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

export interface MapLinkResolution {
  latitude: number;
  longitude: number;
  resolved_url: string;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface FarmSection {
  name: string;
  activity: string;
  crop: string | null;
  boundary: Coordinate[];
}

export interface FarmProjectInput {
  name: string;
  center_latitude: number;
  center_longitude: number;
  boundary: Coordinate[];
  sections: FarmSection[];
}

export interface FarmProject extends FarmProjectInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface CropRule {
  key: string;
  name: string;
  temperature_min_c: number;
  temperature_max_c: number;
  monthly_rainfall_min_mm: number;
  monthly_rainfall_max_mm: number;
  elevation_min_m: number;
  elevation_max_m: number;
  duration_min_days: number;
  duration_max_days: number;
  planting_guidance: string;
  sensitivities: string[];
  source: string;
  custom: boolean;
}

export type CropRuleInput = Omit<CropRule, "key" | "custom">;
