export type Confidence = "High" | "Medium" | "Low";

export interface SourceRecord {
  provider: string;
  kind: "forecast" | "historical" | "modelled" | "derived" | "reference";
  retrieved_at: string;
  confidence: Confidence;
  resolution: string | null;
  limitations: string[];
  stale: boolean;
  age_seconds: number;
}

export interface CurrentWeather {
  temperature_c: number;
  humidity_percent: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  weather_code: number;
  observed_at: string;
  retrieved_at: string;
  precipitation_meaning: string;
}

export interface ClimateMonth {
  month: string;
  rainfall_mm: number;
  mean_temperature_c: number;
  current_year_rainfall_mm: number | null;
  current_year_complete: boolean;
}

export interface RecentDay {
  date: string;
  rainfall_mm: number;
  temperature_min_c: number;
  temperature_max_c: number;
  humidity_percent: number | null;
}

export interface RecentConditions {
  days: RecentDay[];
  classification: "Dry" | "Moderately moist" | "Wet" | "Very wet";
  total_rainfall_mm: number;
  rainy_days: number;
  average_humidity_percent: number | null;
  explanation: string;
  confidence: Confidence;
  method: string;
}

export interface RainfallComparison {
  completed_months: number;
  current_year_total_mm: number;
  expected_total_mm: number;
  difference_mm: number;
  difference_percent: number | null;
  summary: string;
}

export interface EnsoProbability {
  season: string;
  la_nina_percent: number;
  neutral_percent: number;
  el_nino_percent: number;
}

export interface EnsoObservation {
  season: string;
  year: number;
  anomaly_c: number;
}

export interface EnsoTracker {
  status: "Available" | "Unavailable";
  outlook_phase: "El Niño" | "Neutral" | "La Niña" | "Unavailable";
  observed_phase: "El Niño signal" | "Neutral signal" | "La Niña signal" | "Unavailable";
  issued: string | null;
  retrieved_at: string;
  latest_observation: EnsoObservation | null;
  observations: EnsoObservation[];
  probabilities: EnsoProbability[];
  eastern_africa_context: string;
  confidence: Confidence;
  source: string;
  source_url: string;
  regional_source: string;
  regional_source_url: string;
  stale: boolean;
  limitations: string[];
}

export interface LocationContext {
  display_name: string;
  place: string | null;
  ward_or_suburb: string | null;
  subcounty: string | null;
  county: string | null;
  source: string;
  retrieved_at: string;
  limitations: string[];
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
  confidence_explanation: string;
  what_to_verify: string[];
  regional_calendar_status: string;
}

export interface FarmReport {
  latitude: number;
  longitude: number;
  requested_crop: string;
  crop_was_corrected: boolean;
  location: LocationContext;
  elevation_m: number | null;
  current: CurrentWeather;
  recent: RecentConditions;
  climate: ClimateMonth[];
  rainfall_comparison: RainfallComparison;
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
  category: "fruits" | "vegetables" | "other";
  wikipedia_title: string | null;
  image_url: string | null;
  image_source_page_url: string | null;
  image_creator: string | null;
  image_license: string | null;
  image_license_url: string | null;
  image_alt_text: string | null;
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

export interface CropImageMetadata {
  crop_name: string;
  image_url: string;
  source_page_url: string;
  creator: string;
  license: string;
  license_url: string | null;
  alt_text: string;
  retrieved_at: string;
}

export interface CropCatalogItem {
  name: string;
  category: "fruits" | "vegetables" | "other";
  aliases: string[];
  region: string;
  rule_status: "Validated prototype rule" | "Rule pending validation";
  wikipedia_title: string;
  source_notes: string[];
  image: CropImageMetadata | null;
}

export interface SurfaceWaterFeature {
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  source: string;
  limitations: string[];
}

export interface WaterIntelligence {
  recent_rainfall_mm: number;
  recent_moisture_classification: string;
  current_year_rainfall_mm: number;
  expected_rainfall_mm: number;
  forecast_et0_mm: number | null;
  soil_moisture_status: string;
  elevation_m: number | null;
  terrain_status: string;
  irrigation_signal: string;
  irrigation_explanation: string;
  nearest_surface_water: SurfaceWaterFeature | null;
  surface_water_status: string;
  groundwater_status: string;
  piped_water_status: string;
  retrieved_at: string;
  sources: SourceRecord[];
}

export interface LandIntelligence {
  latitude: number;
  longitude: number;
  soil: {
    status: "Available" | "Unavailable";
    properties: Record<string, number | string | null>;
    interpretation: string;
    soil_test_checklist: string[];
    source: string | null;
    limitations: string[];
  };
  terrain: {
    elevation_m: number | null;
    slope_percent: number | null;
    terrain_class: string;
    drainage_interpretation: string;
    erosion_risk: string;
    mechanization_note: string;
    confidence: Confidence;
    limitations: string[];
  };
}

export interface LivestockReport {
  latitude: number;
  longitude: number;
  assessments: {
    livestock: string;
    suitability: "Good" | "Possible with constraints" | "Poor fit";
    confidence: Confidence;
    reasons: string[];
    constraints: string[];
  }[];
  evidence_note: string;
}

export interface AssistantResponse {
  answer: string;
  citations: string[];
  supported_intent: string;
  limitations: string[];
}

export interface ProviderHealth {
  provider: string;
  status: "Healthy" | "Degraded" | "Unknown";
  cache_entries: number;
  cache_hits: number;
  last_success_at: string | null;
  last_latency_ms: number | null;
  last_error: string | null;
}
