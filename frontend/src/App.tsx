import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  CalendarDays,
  BookOpen,
  ChevronRight,
  CloudRain,
  Crosshair,
  Droplets,
  Leaf,
  Link2,
  LoaderCircle,
  MapPin,
  Mountain,
  Plus,
  Search,
  Save,
  ShieldAlert,
  Sparkles,
  SquareDashed,
  ThermometerSun,
} from "lucide-react";
import {
  MapContainer,
  Marker,
  Polygon,
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
import {
  createCropRule,
  createProject,
  getCropRules,
  getCrops,
  getFarmReport,
  getProjects,
  resolveMapLink,
  searchLocations,
} from "./api";
import type {
  Coordinate,
  CropAssessment,
  CropRule,
  CropRuleInput,
  FarmProject,
  FarmReport,
  FarmSection,
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

type DrawMode = "location" | "farm" | "section";

function FarmMapEditor({
  latitude,
  longitude,
  farmBoundary,
  sectionDraft,
  sections,
  onMapClick,
}: {
  latitude: number;
  longitude: number;
  farmBoundary: Coordinate[];
  sectionDraft: Coordinate[];
  sections: FarmSection[];
  onMapClick: (latitude: number, longitude: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });
  const positions = (points: Coordinate[]) =>
    points.map((point) => [point.latitude, point.longitude] as [number, number]);

  return (
    <>
      <Marker position={[latitude, longitude]} icon={markerIcon} />
      {farmBoundary.length >= 2 && (
        <Polygon
          positions={positions(farmBoundary)}
          pathOptions={{ color: "#173f2a", fillColor: "#4f7b52", fillOpacity: 0.12 }}
        />
      )}
      {sections.map((section, index) => (
        <Polygon
          key={`${section.name}-${index}`}
          positions={positions(section.boundary)}
          pathOptions={{
            color: index % 2 === 0 ? "#e8b449" : "#72523f",
            fillOpacity: 0.28,
          }}
        />
      ))}
      {sectionDraft.length >= 2 && (
        <Polygon
          positions={positions(sectionDraft)}
          pathOptions={{ color: "#d36d3c", dashArray: "7 5", fillOpacity: 0.18 }}
        />
      )}
    </>
  );
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
  const [drawMode, setDrawMode] = useState<DrawMode>("location");
  const [farmBoundary, setFarmBoundary] = useState<Coordinate[]>([]);
  const [sectionDraft, setSectionDraft] = useState<Coordinate[]>([]);
  const [sections, setSections] = useState<FarmSection[]>([]);
  const [projectName, setProjectName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionActivity, setSectionActivity] = useState("");
  const [sectionCrop, setSectionCrop] = useState("");
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [cropRules, setCropRules] = useState<CropRule[]>([]);
  const [cropRuleMessage, setCropRuleMessage] = useState<string | null>(null);

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
    void getCropRules().then(setCropRules).catch(() => setCropRules([]));
    void getProjects().then(setProjects).catch(() => setProjects([]));
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

  const handleMapClick = (nextLatitude: number, nextLongitude: number) => {
    const point = { latitude: nextLatitude, longitude: nextLongitude };
    if (drawMode === "farm") {
      setFarmBoundary((current) => [...current, point]);
      return;
    }
    if (drawMode === "section") {
      setSectionDraft((current) => [...current, point]);
      return;
    }
    updateLocation(nextLatitude, nextLongitude);
  };

  const addSection = () => {
    if (sectionDraft.length < 3 || !sectionName.trim() || !sectionActivity.trim()) {
      setProjectMessage(
        "Draw at least three section points and enter its name and activity.",
      );
      return;
    }
    setSections((current) => [
      ...current,
      {
        name: sectionName.trim(),
        activity: sectionActivity.trim(),
        crop: sectionCrop.trim() || null,
        boundary: sectionDraft,
      },
    ]);
    setSectionDraft([]);
    setSectionName("");
    setSectionActivity("");
    setSectionCrop("");
    setDrawMode("location");
    setProjectMessage("Farm section added. Save the project to persist it.");
  };

  const saveProject = async () => {
    if (!projectName.trim() || farmBoundary.length < 3) {
      setProjectMessage(
        "Enter a project name and draw at least three farm-boundary points.",
      );
      return;
    }
    try {
      const saved = await createProject({
        name: projectName.trim(),
        center_latitude: latitude,
        center_longitude: longitude,
        boundary: farmBoundary,
        sections,
      });
      setProjects((current) => [saved, ...current]);
      setProjectMessage(`Saved ${saved.name} with ${saved.sections.length} sections.`);
    } catch (saveError) {
      setProjectMessage(
        saveError instanceof Error ? saveError.message : "The project could not be saved.",
      );
    }
  };

  const loadProject = (project: FarmProject) => {
    setProjectName(project.name);
    setFarmBoundary(project.boundary);
    setSections(project.sections);
    setSectionDraft([]);
    setDrawMode("location");
    updateLocation(project.center_latitude, project.center_longitude);
    setProjectMessage(`Loaded ${project.name}.`);
  };

  const submitCropRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const numeric = (name: string) => Number(form.get(name));
    const payload: CropRuleInput = {
      name: String(form.get("name") ?? ""),
      temperature_min_c: numeric("temperature_min_c"),
      temperature_max_c: numeric("temperature_max_c"),
      monthly_rainfall_min_mm: numeric("monthly_rainfall_min_mm"),
      monthly_rainfall_max_mm: numeric("monthly_rainfall_max_mm"),
      elevation_min_m: numeric("elevation_min_m"),
      elevation_max_m: numeric("elevation_max_m"),
      duration_min_days: numeric("duration_min_days"),
      duration_max_days: numeric("duration_max_days"),
      planting_guidance: String(form.get("planting_guidance") ?? ""),
      sensitivities: String(form.get("sensitivities") ?? "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      source: String(form.get("source") ?? ""),
    };
    try {
      const saved = await createCropRule(payload);
      setCropRules((current) =>
        [...current, saved].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCropOptions((current) =>
        [...new Set([...current, saved.name])].sort(),
      );
      setCropRuleMessage(`${saved.name} is now available in the farm analyzer.`);
      event.currentTarget.reset();
    } catch (ruleError) {
      setCropRuleMessage(
        ruleError instanceof Error ? ruleError.message : "The crop rule could not be saved.",
      );
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
          <a href="#farm-projects">My farms</a>
          <a href="#advisor">Crop advisor</a>
          <a href="#crop-rules">Crop rules</a>
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
            <FarmMapEditor
              latitude={latitude}
              longitude={longitude}
              farmBoundary={farmBoundary}
              sectionDraft={sectionDraft}
              sections={sections}
              onMapClick={handleMapClick}
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
          <div className="farm-map-tools" aria-label="Farm drawing tools">
            <button
              className={drawMode === "location" ? "active" : ""}
              type="button"
              onClick={() => setDrawMode("location")}
            >
              <MapPin size={16} /> Pin
            </button>
            <button
              className={drawMode === "farm" ? "active" : ""}
              type="button"
              onClick={() => setDrawMode("farm")}
            >
              <SquareDashed size={16} /> Farm boundary
            </button>
            <button
              className={drawMode === "section" ? "active" : ""}
              type="button"
              onClick={() => setDrawMode("section")}
            >
              <Plus size={16} /> Section
            </button>
          </div>
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
        <section className="project-builder panel" id="farm-projects">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Farm projects</p>
              <h2>Map and save your farm plan</h2>
            </div>
            <Save size={24} />
          </div>
          <p className="panel-intro">
            Select <strong>Farm boundary</strong>, then click around the outside
            of the farm. Use <strong>Section</strong> to draw portions for
            different activities.
          </p>
          <div className="project-grid">
            <div className="project-form">
              <label>
                Project name
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="e.g. Mwangaza Farm"
                />
              </label>
              <div className="boundary-summary">
                <span>{farmBoundary.length} farm boundary points</span>
                <button
                  type="button"
                  onClick={() => {
                    setFarmBoundary([]);
                    setSections([]);
                    setSectionDraft([]);
                  }}
                >
                  Clear map
                </button>
              </div>
              <div className="section-editor">
                <h3>Add a farm section</h3>
                <label>
                  Section name
                  <input
                    value={sectionName}
                    onChange={(event) => setSectionName(event.target.value)}
                    placeholder="e.g. North field"
                  />
                </label>
                <label>
                  Planned activity
                  <input
                    value={sectionActivity}
                    onChange={(event) => setSectionActivity(event.target.value)}
                    placeholder="e.g. Planting and drip irrigation"
                  />
                </label>
                <label>
                  Crop or use
                  <input
                    list="crop-options"
                    value={sectionCrop}
                    onChange={(event) => setSectionCrop(event.target.value)}
                    placeholder="e.g. pineapple, pasture, poultry"
                  />
                </label>
                <div className="boundary-summary">
                  <span>{sectionDraft.length} section points</span>
                  <button type="button" onClick={addSection}>
                    Add section
                  </button>
                </div>
              </div>
              <button className="primary-button" type="button" onClick={saveProject}>
                Save farm project
              </button>
              {projectMessage && <p className="form-message">{projectMessage}</p>}
            </div>
            <div className="saved-projects">
              <h3>Saved farms</h3>
              {projects.length === 0 && <p>No farms saved yet.</p>}
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => loadProject(project)}
                >
                  <strong>{project.name}</strong>
                  <span>
                    {project.sections.length} sections ·{" "}
                    {new Date(project.updated_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
              {sections.length > 0 && (
                <div className="section-list">
                  <h3>Current sections</h3>
                  {sections.map((section, index) => (
                    <article key={`${section.name}-${index}`}>
                      <strong>{section.name}</strong>
                      <span>{section.activity}</span>
                      {section.crop && <small>{section.crop}</small>}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
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
        <section className="crop-catalog panel" id="crop-rules">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Crop knowledge</p>
              <h2>Available crop rules</h2>
            </div>
            <BookOpen size={24} />
          </div>
          <p className="panel-intro">
            These rules drive the analyzer. Custom rules require a named source
            so their assumptions remain visible.
          </p>
          <div className="crop-rule-grid">
            {cropRules.map((rule) => (
              <article key={rule.key}>
                <div>
                  <strong>{rule.name}</strong>
                  {rule.custom && <span className="custom-badge">Custom</span>}
                </div>
                <p>
                  {rule.temperature_min_c}-{rule.temperature_max_c} C ·{" "}
                  {rule.monthly_rainfall_min_mm}-{rule.monthly_rainfall_max_mm} mm/month
                </p>
                <span>
                  {rule.elevation_min_m}-{rule.elevation_max_m} m ·{" "}
                  {rule.duration_min_days}-{rule.duration_max_days} days
                </span>
                <small>{rule.source}</small>
              </article>
            ))}
          </div>
          <details className="add-crop-rule">
            <summary>Add another crop rule</summary>
            <form onSubmit={submitCropRule}>
              <label>
                Crop name
                <input name="name" placeholder="e.g. passion fruit" required />
              </label>
              <label>
                Source
                <input
                  name="source"
                  placeholder="Publication, extension guide, or expert reference"
                  required
                />
              </label>
              <div className="rule-range">
                <label>Min temperature (C)<input name="temperature_min_c" type="number" step="0.1" required /></label>
                <label>Max temperature (C)<input name="temperature_max_c" type="number" step="0.1" required /></label>
                <label>Min rainfall (mm/month)<input name="monthly_rainfall_min_mm" type="number" step="0.1" required /></label>
                <label>Max rainfall (mm/month)<input name="monthly_rainfall_max_mm" type="number" step="0.1" required /></label>
                <label>Min elevation (m)<input name="elevation_min_m" type="number" step="1" required /></label>
                <label>Max elevation (m)<input name="elevation_max_m" type="number" step="1" required /></label>
                <label>Min duration (days)<input name="duration_min_days" type="number" required /></label>
                <label>Max duration (days)<input name="duration_max_days" type="number" required /></label>
              </div>
              <label>
                Planting guidance
                <textarea name="planting_guidance" rows={3} required />
              </label>
              <label>
                Main risks, one per line
                <textarea name="sensitivities" rows={3} required />
              </label>
              <button className="primary-button" type="submit">
                Add crop rule
              </button>
              {cropRuleMessage && <p className="form-message">{cropRuleMessage}</p>}
            </form>
          </details>
        </section>
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
