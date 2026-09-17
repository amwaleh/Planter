import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  CalendarDays,
  CircleGauge,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Crosshair,
  Droplets,
  Info,
  Link2,
  LoaderCircle,
  Mountain,
  Search,
  ShieldAlert,
  Sparkles,
  ThermometerSun,
} from "lucide-react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getCrops,
  getEnsoTracker,
  getFarmReport,
  resolveMapLink,
  searchLocations,
} from "./api";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { useLanguage } from "./i18n";
import { EAST_AFRICA_COORDINATE_HELP, isWithinEastAfrica } from "./region";
import type {
  CropAssessment,
  EnsoTracker,
  FarmReport,
  LocationMatch,
} from "./types";

const fallbackCrops = ["onion", "maize", "beans", "potato", "sorghum", "tomato"];
const defaultLocation = { latitude: -0.7167, longitude: 36.4333 };

const markerIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function formatNairobiTime(value: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}

function formatAge(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "updated less than a minute ago";
  if (minutes < 60) return `updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function MapPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  useMapEvents({
    click(event) {
      onChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return <Marker position={[latitude, longitude]} icon={markerIcon} />;
}

function MetricCard({
  icon,
  eyebrow,
  value,
  detail,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function AssessmentPanel({ assessment }: { assessment: CropAssessment }) {
  return (
    <section className="assessment panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Crop advisor</p>
          <h2>
            {assessment.crop} is a {assessment.category.toLowerCase()} fit
          </h2>
        </div>
        <span className="fit-category">{assessment.category}</span>
      </div>
      <div className="confidence-row">
        <span className="confidence">{assessment.confidence} confidence</span>
        <span>{assessment.confidence_explanation}</span>
      </div>
      <div className="assessment-grid">
        <div>
          <h3>Why it fits</h3>
          <ul className="clean-list">
            {assessment.reasons.map((reason) => (
              <li key={reason}>
                <span className="positive-dot" /> {reason}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Risks to manage</h3>
          <ul className="clean-list">
            {assessment.risks.map((risk) => (
              <li key={risk}>
                <span className="risk-dot" /> {risk}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="calendar-strip">
        <CalendarDays size={22} />
        <div>
          <strong>Planting</strong>
          <span>{assessment.planting_guidance}</span>
        </div>
        <ChevronRight size={18} />
        <div>
          <strong>Harvest</strong>
          <span>{assessment.harvest_guidance}</span>
        </div>
      </div>
      <p className="calendar-status">{assessment.regional_calendar_status}</p>
      <div className="verification-box">
        <h3>What to verify before investing</h3>
        <ul>
          {assessment.what_to_verify.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
      <details className="methodology">
        <summary>How this result was calculated</summary>
        <p>{assessment.method}</p>
        <dl>
          {Object.entries(assessment.component_scores).map(([name, score]) => (
            <div key={name}><dt>{name}</dt><dd>{score}/100</dd></div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function EnsoPanel({
  tracker,
  loading,
}: {
  tracker: EnsoTracker | null;
  loading: boolean;
}) {
  const seasonNames: Record<string, string> = {
    ASO: "Aug–Sep–Oct",
    SON: "Sep–Oct–Nov",
    OND: "Oct–Nov–Dec",
    NDJ: "Nov–Dec–Jan",
    DJF: "Dec–Jan–Feb",
    JFM: "Jan–Feb–Mar",
    FMA: "Feb–Mar–Apr",
    MAM: "Mar–Apr–May",
    AMJ: "Apr–May–Jun",
  };
  if (loading) {
    return (
      <section className="panel enso-panel" aria-busy="true">
        <p className="eyebrow">Seasonal climate</p>
        <h2>Loading ENSO tracker...</h2>
        <div className="enso-loading"><span /></div>
      </section>
    );
  }
  if (!tracker || tracker.status === "Unavailable") {
    return (
      <section className="panel enso-panel">
        <p className="eyebrow">Seasonal climate</p>
        <h2>ENSO tracker unavailable</h2>
        <p>{tracker?.eastern_africa_context ?? "No seasonal ENSO values were substituted."}</p>
      </section>
    );
  }
  const phaseClass = tracker.outlook_phase.toLowerCase().replace(" ", "-").replace("ñ", "n");
  return (
    <section className="panel enso-panel" id="enso">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Seasonal climate · ENSO</p>
          <h2>{tracker.outlook_phase} favored</h2>
        </div>
        <CircleGauge size={25} />
      </div>
      <div className="enso-status-row">
        <span className={`enso-phase enso-${phaseClass}`}>{tracker.outlook_phase}</span>
        <span className="enso-regional-badge">
          {tracker.regional_location} · {tracker.regional_season}: {tracker.regional_relationship}
        </span>
        <span>
          Latest ONI: <strong>{tracker.latest_observation?.anomaly_c.toFixed(2)}°C</strong>
          {" · "}{tracker.latest_observation?.season} {tracker.latest_observation?.year}
        </span>
      </div>
      <p className="panel-intro">{tracker.eastern_africa_context}</p>
      <div className="enso-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={tracker.observations}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="season" tickLine={false} axisLine={false} />
            <YAxis domain={[-2.5, 2.5]} tickLine={false} axisLine={false} unit="°" />
            <Tooltip />
            <Line dataKey="anomaly_c" name="ONI anomaly °C" stroke="#d36d3c" strokeWidth={3} dot />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="enso-probabilities" aria-label="NOAA ENSO phase probabilities">
        <div className="enso-help">
          <button type="button" aria-describedby="enso-probability-help">
            <Info size={16} />
            How to read these probabilities
          </button>
          <div className="enso-help-popover" id="enso-probability-help" role="tooltip">
            <strong>Each code covers three months.</strong>
            <p>
              Values are always ordered <b>La Niña / Neutral / El Niño</b>. For example,
              0% / 18% / 82% means an 82% El Niño probability, not an 82% chance of rain.
            </p>
            <dl>
              {Object.entries(seasonNames).map(([code, months]) => (
                <div key={code}><dt>{code}</dt><dd>{months}</dd></div>
              ))}
            </dl>
            <small>NOAA displays 0% as approximately zero, not impossible.</small>
          </div>
        </div>
        {tracker.probabilities.map((probability) => (
          <div className="enso-probability-row" key={probability.season}>
            <strong title={seasonNames[probability.season]}>{probability.season}</strong>
            <div className="enso-probability-bar">
              <span className="enso-la-nina" style={{ width: `${probability.la_nina_percent}%` }} />
              <span className="enso-neutral" style={{ width: `${probability.neutral_percent}%` }} />
              <span className="enso-el-nino" style={{ width: `${probability.el_nino_percent}%` }} />
            </div>
            <span>{probability.la_nina_percent}% / {probability.neutral_percent}% / {probability.el_nino_percent}%</span>
          </div>
        ))}
        <div className="enso-key">
          <span><i className="enso-la-nina" />La Niña</span>
          <span><i className="enso-neutral" />Neutral</span>
          <span><i className="enso-el-nino" />El Niño</span>
        </div>
      </div>
      <details className="methodology">
        <summary>Sources and limitations</summary>
        <p>
          Issued {tracker.issued}; retrieved {new Date(tracker.retrieved_at).toLocaleString()}.
          {" "}{tracker.stale ? "Cached data is shown. " : ""}
          Confidence: {tracker.confidence}.
        </p>
        <ul>{tracker.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        <p>
          <a href={tracker.source_url} target="_blank" rel="noreferrer">{tracker.source}</a>
          {" · "}
          <a href={tracker.regional_source_url} target="_blank" rel="noreferrer">{tracker.regional_source}</a>
        </p>
      </details>
    </section>
  );
}

export default function App() {
  const { t } = useLanguage();
  const [latitude, setLatitude] = useState(defaultLocation.latitude);
  const [longitude, setLongitude] = useState(defaultLocation.longitude);
  const [latitudeInput, setLatitudeInput] = useState(latitude.toFixed(4));
  const [longitudeInput, setLongitudeInput] = useState(longitude.toFixed(4));
  const [crop, setCrop] = useState("onion");
  const [cropInput, setCropInput] = useState("onion");
  const [cropOptions, setCropOptions] = useState(fallbackCrops);
  const [placeQuery, setPlaceQuery] = useState("");
  const [matches, setMatches] = useState<LocationMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapLink, setMapLink] = useState("");
  const [resolvingMapLink, setResolvingMapLink] = useState(false);
  const [report, setReport] = useState<FarmReport | null>(null);
  const [ensoTracker, setEnsoTracker] = useState<EnsoTracker | null>(null);
  const [ensoLoading, setEnsoLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reportCountry = report ? report.location.country : undefined;

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getFarmReport(latitude, longitude, crop));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Farm intelligence could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [crop, latitude, longitude]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    void getCrops()
      .then(setCropOptions)
      .catch(() => setCropOptions(fallbackCrops));
  }, []);

  useEffect(() => {
    if (reportCountry === undefined) return;
    setEnsoLoading(true);
    void getEnsoTracker(reportCountry)
      .then(setEnsoTracker)
      .catch(() => setEnsoTracker(null))
      .finally(() => setEnsoLoading(false));
  }, [reportCountry]);

  const updateLocation = (nextLatitude: number, nextLongitude: number) => {
    if (!isWithinEastAfrica(nextLatitude, nextLongitude)) {
      setError(EAST_AFRICA_COORDINATE_HELP);
      return false;
    }
    setError(null);
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setLatitudeInput(nextLatitude.toFixed(4));
    setLongitudeInput(nextLongitude.toFixed(4));
    return true;
  };

  const useCurrentLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        updateLocation(position.coords.latitude, position.coords.longitude),
      () => setError("Location access was unavailable. Drop a pin or enter coordinates."),
    );
  };

  const searchForPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (placeQuery.trim().length < 2) {
      setError("Enter at least two characters to search for an Eastern Africa place.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setMatches(await searchLocations(placeQuery.trim()));
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Eastern Africa place search is unavailable.",
      );
    } finally {
      setSearching(false);
    }
  };

  const chooseMatch = (match: LocationMatch) => {
    updateLocation(match.latitude, match.longitude);
    setPlaceQuery(
      [match.name, match.admin2, match.admin1].filter(Boolean).join(", "),
    );
    setMatches([]);
  };

  const submitCoordinates = (event: React.FormEvent) => {
    event.preventDefault();
    const nextLatitude = Number(latitudeInput);
    const nextLongitude = Number(longitudeInput);
    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setError("Enter valid numeric coordinates.");
      return;
    }
    if (updateLocation(nextLatitude, nextLongitude)) {
      setCrop(cropInput.trim());
    }
  };

  const submitMapLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setResolvingMapLink(true);
    setError(null);
    try {
      const resolution = await resolveMapLink(mapLink.trim());
      updateLocation(resolution.latitude, resolution.longitude);
    } catch (resolutionError) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : "The Google Maps link could not be resolved.",
      );
    } finally {
      setResolvingMapLink(false);
    }
  };

  const bestAlternative = useMemo(() => report?.alternatives[0], [report]);

  return (
    <main>
      <SiteHeader />

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">
            <Sparkles size={16} /> Eastern Africa farm intelligence
          </p>
          <h1>{t("heroTitle")}</h1>
          <p>{t("heroBody")}</p>
          <div className="trust-line">
            <span>Evidence-backed</span>
            <span>Source transparent</span>
            <span>Uncertainty included</span>
          </div>
        </div>
        <div className="map-shell">
          <MapContainer
            center={[latitude, longitude]}
            zoom={8}
            scrollWheelZoom
            className="map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapPicker
              latitude={latitude}
              longitude={longitude}
              onChange={updateLocation}
            />
          </MapContainer>
          <form className="map-search" onSubmit={searchForPlace}>
            <Search size={18} />
            <input
              aria-label="Search for an Eastern Africa place"
              placeholder="Search an Eastern Africa town or place"
              value={placeQuery}
              onChange={(event) => setPlaceQuery(event.target.value)}
            />
            <button type="submit" aria-label="Search places">
              {searching ? <LoaderCircle className="spin" size={18} /> : "Find"}
            </button>
            {matches.length > 0 && (
              <div className="search-results">
                {matches.map((match) => (
                  <button
                    key={`${match.name}-${match.latitude}-${match.longitude}`}
                    type="button"
                    onClick={() => chooseMatch(match)}
                  >
                    <strong>{match.name}</strong>
                    <span>
                      {[match.admin2, match.admin1].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>
          <button className="gps-button" type="button" onClick={useCurrentLocation}>
            <Crosshair size={18} />
            {t("useLocation")}
          </button>
        </div>
      </section>

      <section className="workspace" id="overview">
        <form className="map-link-form" onSubmit={submitMapLink}>
          <div className="map-link-copy">
            <span className="map-link-icon">
              <Link2 size={20} />
            </span>
            <div>
              <strong>Paste a Google Maps share link</strong>
              <span>Use the exact location from a shared pin or place.</span>
            </div>
          </div>
          <input
            aria-label="Google Maps share link"
            type="url"
            placeholder="https://maps.app.goo.gl/..."
            value={mapLink}
            onChange={(event) => setMapLink(event.target.value)}
            required
          />
          <button type="submit" disabled={resolvingMapLink}>
            {resolvingMapLink ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              "Use location"
            )}
          </button>
        </form>
        <form className="controls" onSubmit={submitCoordinates}>
          <label>
            Latitude
            <input
              value={latitudeInput}
              onChange={(event) => setLatitudeInput(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Longitude
            <input
              value={longitudeInput}
              onChange={(event) => setLongitudeInput(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Crop to assess
            <input
              list="crop-options"
              value={cropInput}
              onChange={(event) => setCropInput(event.target.value)}
              placeholder="Type a crop, e.g. tomatoes"
              required
            />
            <datalist id="crop-options">
              {cropOptions.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <button className="primary-button" type="submit">
            {t("analyze")}
          </button>
        </form>

        {loading && (
          <div className="state-message">
            <LoaderCircle className="spin" /> Building the farm evidence package...
          </div>
        )}
        {error && <div className="state-message error">{error}</div>}

        {report && !loading && (
          <>
            {report.crop_was_corrected && (
              <div className="correction-message">
                Interpreted “{report.requested_crop}” as{" "}
                <strong>{report.crop.crop}</strong>.
              </div>
            )}
            <div className="section-heading">
              <div>
                <p className="eyebrow">Farm overview</p>
                <h2>{report.location.display_name}</h2>
                <small className="coordinate-caption">
                  {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                </small>
              </div>
              <span className="live-badge">
                {report.sources.some((source) => source.stale) ? "Cached provider data" : "Fresh provider data"}
              </span>
            </div>

            <div className="metrics-grid">
              <MetricCard
                icon={<ThermometerSun />}
                eyebrow="Current temperature"
                value={`${report.current.temperature_c.toFixed(1)} C`}
                detail={`${report.current.humidity_percent}% humidity · observed ${formatNairobiTime(report.current.observed_at)} EAT · ${formatAge(report.current.retrieved_at)}`}
              />
              <MetricCard
                icon={<CloudRain />}
                eyebrow="Current precipitation"
                value={`${report.current.precipitation_mm.toFixed(1)} mm`}
                detail={`${report.current.precipitation_meaning} Observed ${formatNairobiTime(report.current.observed_at)} EAT.`}
              />
              <MetricCard
                icon={<Mountain />}
                eyebrow="Elevation"
                value={
                  report.elevation_m === null
                    ? "Unavailable"
                    : `${Math.round(report.elevation_m)} m`
                }
                detail="Modelled terrain elevation"
              />
              <MetricCard
                icon={<Droplets />}
                eyebrow="Water evidence"
                value="Limited"
                detail="Groundwater is not inferred"
              />
            </div>

            <nav className="report-tabs" aria-label="Farm report sections">
              <a href="#recent">Recent conditions</a>
              <a href="#advisor">Crop advisor</a>
              <a href="#climate">Rainfall and climate</a>
              <a href={`/water?lat=${report.latitude}&lng=${report.longitude}`}>Water</a>
              <a href={`/land?lat=${report.latitude}&lng=${report.longitude}`}>Soil and terrain</a>
              <a href="#sources">Sources</a>
            </nav>

            <section className="panel recent-panel" id="recent">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Previous 21 completed days</p>
                  <h2>{report.recent.classification}</h2>
                </div>
                <span className="confidence">{report.recent.confidence} confidence</span>
              </div>
              <p className="panel-intro">{report.recent.explanation}</p>
              <div className="recent-summary">
                <span><strong>{report.recent.total_rainfall_mm} mm</strong> total rain</span>
                <span><strong>{report.recent.rainy_days}</strong> rainy days</span>
                <span><strong>{report.recent.average_humidity_percent ?? "Unavailable"}{report.recent.average_humidity_percent !== null ? "%" : ""}</strong> average humidity</span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={report.recent.days}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} />
                    <YAxis yAxisId="rain" />
                    <YAxis yAxisId="temperature" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="rain" dataKey="rainfall_mm" name="Rainfall mm" fill="#4f7b52" />
                    <Line yAxisId="temperature" dataKey="temperature_max_c" name="Max C" stroke="#d36d3c" dot={false} />
                    <Line yAxisId="temperature" dataKey="temperature_min_c" name="Min C" stroke="#3975a8" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <details className="methodology"><summary>Classification method</summary><p>{report.recent.method}</p></details>
            </section>

            <div className="content-grid">
              <section className="panel chart-panel" id="climate">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Historical pattern</p>
                    <h2>Monthly rainfall</h2>
                  </div>
                  <CloudRain size={24} />
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={report.climate}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} unit=" mm" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="current_year_rainfall_mm" name="Current year" fill="#4f7b52" radius={[6, 6, 0, 0]} />
                      <Line dataKey="rainfall_mm" name="10-year average" stroke="#e8b449" strokeWidth={3} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="chart-summary">{report.rainfall_comparison.summary}</p>
                <p className="chart-summary">The current month is partial and is excluded from the year-to-date comparison.</p>
              </section>
              <EnsoPanel tracker={ensoTracker} loading={ensoLoading} />
            </div>

            <div className="content-grid" id="advisor">
              <AssessmentPanel assessment={report.crop} />
              <section className="panel outlook-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">21-day agricultural outlook</p>
                    <h2>Signals, not certainty</h2>
                  </div>
                  <ShieldAlert size={24} />
                </div>
                {ensoTracker?.status === "Available" && (
                  <a className="enso-outlook-badge" href="#enso">
                    Seasonal context: {ensoTracker.outlook_phase} favored
                  </a>
                )}
                <div className="outlook-list">
                  {report.outlook.map((signal) => (
                    <article key={signal.label}>
                      <span className={`signal signal-${signal.level.toLowerCase()}`}>
                        {signal.level}
                      </span>
                      <div>
                        <strong>{signal.label}</strong>
                        <p>{signal.detail}</p>
                        <small>{signal.confidence} confidence</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel alternative-panel">
              <p className="eyebrow">Lower-risk alternative</p>
              <h2>{bestAlternative?.crop ?? "No alternative assessed"}</h2>
              {bestAlternative && (
                <>
                  <div className="alternative-score">
                    <strong>{bestAlternative.category}</strong>
                    <span>relative suitability from the same documented method</span>
                  </div>
                  <p>{bestAlternative.reasons[0]}</p>
                </>
              )}
            </section>

            <details className="panel sources-panel" id="sources">
              <summary className="panel-heading">
                <div>
                  <p className="eyebrow">Explainability</p>
                  <h2>Where this advice comes from</h2>
                </div>
                <span className="sources-toggle">
                  <span className="when-closed">Show sources and limitations</span>
                  <span className="when-open">Hide sources and limitations</span>
                  <ChevronDown size={22} />
                </span>
              </summary>
              <div className="source-table">
                {report.sources.map((source) => (
                  <article key={`${source.provider}-${source.kind}`}>
                    <div>
                      <strong>{source.kind === "derived" ? "Recommendation method" : "Farm information"}</strong>
                      <span>{source.provider}</span>
                    </div>
                    <div>
                      <strong>{source.confidence} reliability</strong>
                      <span>{source.stale ? "Cached data" : "Updated"} {new Date(source.retrieved_at).toLocaleString()}</span>
                    </div>
                    <p>{source.resolution && `${source.resolution} `}{source.limitations.join(" ")}</p>
                  </article>
                ))}
                {report.unavailable.map((item) => (
                  <article key={item.capability} className="unavailable">
                    <div>
                      <strong>{item.capability}</strong>
                      <span>Unavailable</span>
                    </div>
                    <p>{item.reason}</p>
                  </article>
                ))}
              </div>
            </details>
          </>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
