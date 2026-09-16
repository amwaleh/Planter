import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  CalendarDays,
  ChevronRight,
  CloudRain,
  Crosshair,
  Droplets,
  Leaf,
  Link2,
  LoaderCircle,
  MapPin,
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
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCrops, getFarmReport, resolveMapLink, searchLocations } from "./api";
import type { CropAssessment, FarmReport, LocationMatch } from "./types";

const fallbackCrops = ["onion", "maize", "beans", "potato", "sorghum", "tomato"];
const defaultLocation = { latitude: -0.7167, longitude: 36.4333 };

const markerIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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
        <div className={`score score-${assessment.category.toLowerCase()}`}>
          <strong>{assessment.score}</strong>
          <span>/100</span>
        </div>
      </div>
      <div className="confidence-row">
        <span className="confidence">{assessment.confidence} confidence</span>
        <span>{assessment.method}</span>
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
    </section>
  );
}

export default function App() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const updateLocation = (nextLatitude: number, nextLongitude: number) => {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setLatitudeInput(nextLatitude.toFixed(4));
    setLongitudeInput(nextLongitude.toFixed(4));
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
      setError("Enter at least two characters to search for a Kenyan place.");
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
          : "Kenyan place search is unavailable.",
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
    setCrop(cropInput.trim());
    updateLocation(nextLatitude, nextLongitude);
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
      <header className="site-header">
        <a className="brand" href="#" aria-label="Planter home">
          <span className="brand-mark">
            <Leaf size={21} />
          </span>
          <span>Planter</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#overview">Farm overview</a>
          <a href="#advisor">Crop advisor</a>
          <a href="#sources">Evidence</a>
        </nav>
        <button className="language-button" type="button">
          EN <span aria-hidden="true">/</span> SW
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">
            <Sparkles size={16} /> Kenya-first farm intelligence
          </p>
          <h1>Know what your land can become.</h1>
          <p>
            Turn one location into an explainable view of weather, climate,
            terrain, crop fit, and farm risks.
          </p>
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
              aria-label="Search for a Kenyan place"
              placeholder="Search a Kenyan town or place"
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
            Use my location
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
            Analyze farm
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
                <h2>
                  Evidence for {report.latitude.toFixed(3)},{" "}
                  {report.longitude.toFixed(3)}
                </h2>
              </div>
              <span className="live-badge">Live provider data</span>
            </div>

            <div className="metrics-grid">
              <MetricCard
                icon={<ThermometerSun />}
                eyebrow="Temperature"
                value={`${report.current.temperature_c.toFixed(1)} C`}
                detail={`${report.current.humidity_percent}% relative humidity`}
              />
              <MetricCard
                icon={<CloudRain />}
                eyebrow="Precipitation"
                value={`${report.current.precipitation_mm.toFixed(1)} mm`}
                detail="Current provider reading"
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

            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Historical pattern</p>
                    <h2>Monthly rainfall</h2>
                  </div>
                  <CloudRain size={24} />
                </div>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.climate}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} unit=" mm" />
                      <Tooltip />
                      <Bar dataKey="rainfall_mm" fill="#4f7b52" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="panel alternative-panel">
                <p className="eyebrow">Lower-risk alternative</p>
                <h2>{bestAlternative?.crop ?? "No alternative assessed"}</h2>
                {bestAlternative && (
                  <>
                    <div className="alternative-score">
                      <strong>{bestAlternative.score}</strong>
                      <span>{bestAlternative.category} suitability</span>
                    </div>
                    <p>{bestAlternative.reasons[0]}</p>
                  </>
                )}
              </section>
            </div>

            <section className="panel sources-panel" id="sources">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Explainability</p>
                  <h2>Evidence and limitations</h2>
                </div>
                <MapPin size={24} />
              </div>
              <div className="source-table">
                {report.sources.map((source) => (
                  <article key={`${source.provider}-${source.kind}`}>
                    <div>
                      <strong>{source.provider}</strong>
                      <span>{source.kind}</span>
                    </div>
                    <div>
                      <strong>{source.confidence} confidence</strong>
                      <span>{new Date(source.retrieved_at).toLocaleString()}</span>
                    </div>
                    <p>{source.limitations.join(" ")}</p>
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
            </section>
          </>
        )}
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={19} />
          </span>
          Planter
        </div>
        <p>Decision support for Kenyan farms. Verify critical decisions with local experts.</p>
      </footer>
    </main>
  );
}
