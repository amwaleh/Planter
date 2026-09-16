import { useEffect, useState } from "react";
import L from "leaflet";
import { Focus, MapPin, Plus, RotateCcw, Save, SquareDashed, Undo2 } from "lucide-react";
import {
  FeatureGroup,
  LayersControl,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { createProject, getCrops, getProjects } from "../api";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { Coordinate, FarmProject, FarmSection } from "../types";

type DrawMode = "location" | "farm" | "section";

const markerIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function ProjectMap({
  latitude,
  longitude,
  boundary,
  sectionDraft,
  sections,
  projectName,
  fitRequest,
  onClick,
}: {
  latitude: number;
  longitude: number;
  boundary: Coordinate[];
  sectionDraft: Coordinate[];
  sections: FarmSection[];
  projectName: string;
  fitRequest: number;
  onClick: (latitude: number, longitude: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  useMapEvents({
    click(event) {
      onClick(event.latlng.lat, event.latlng.lng);
    },
  });
  const positions = (points: Coordinate[]) =>
    points.map((point) => [point.latitude, point.longitude] as [number, number]);
  useEffect(() => {
    if (fitRequest === 0) return;
    const points = [
      [latitude, longitude] as [number, number],
      ...positions(boundary),
      ...positions(sectionDraft),
      ...sections.flatMap((section) => positions(section.boundary)),
    ];
    if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 18 });
    }
  }, [boundary, fitRequest, latitude, longitude, map, sectionDraft, sections]);

  return (
    <>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain map">
          <TileLayer
            attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Farm marker">
          <FeatureGroup>
            <Marker position={[latitude, longitude]} icon={markerIcon} bubblingMouseEvents={false}>
              <Tooltip>{projectName.trim() || "Farm centre"}</Tooltip>
              <Popup>
                <strong>{projectName.trim() || "Farm centre"}</strong>
                <br />
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </Popup>
            </Marker>
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm boundary">
          <FeatureGroup>
            {boundary.length >= 2 && (
              <Polyline positions={positions(boundary)} pathOptions={{ color: "#173f2a", weight: 3, bubblingMouseEvents: false }} />
            )}
            {boundary.length >= 3 && (
              <Polygon
                positions={positions(boundary)}
                pathOptions={{ color: "#173f2a", fillColor: "#4f7b52", fillOpacity: 0.12, bubblingMouseEvents: false }}
              >
                <Tooltip sticky>{projectName.trim() || "Farm boundary"}</Tooltip>
              </Polygon>
            )}
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm sections">
          <FeatureGroup>
            {sections.map((section, index) => (
              <Polygon
                key={`${section.name}-${index}`}
                positions={positions(section.boundary)}
                pathOptions={{
                  color: index % 2 === 0 ? "#e8b449" : "#72523f",
                  fillOpacity: 0.28,
                  bubblingMouseEvents: false,
                }}
              >
                <Tooltip sticky>
                  <strong>{section.name}</strong>
                  <br />
                  {section.activity}
                  {section.crop ? ` · ${section.crop}` : ""}
                </Tooltip>
                <Popup>
                  <strong>{section.name}</strong>
                  <br />
                  Activity: {section.activity}
                  {section.crop && <><br />Crop/use: {section.crop}</>}
                </Popup>
              </Polygon>
            ))}
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Draft lines">
          <FeatureGroup>
            {sectionDraft.length >= 2 && (
              <Polyline
                positions={positions(sectionDraft)}
                pathOptions={{ color: "#d36d3c", dashArray: "7 5", weight: 3, bubblingMouseEvents: false }}
              >
                <Tooltip sticky>Section being drawn</Tooltip>
              </Polyline>
            )}
          </FeatureGroup>
        </LayersControl.Overlay>
      </LayersControl>
    </>
  );
}

export default function FarmProjectsPage() {
  const [latitude, setLatitude] = useState(-0.7167);
  const [longitude, setLongitude] = useState(36.4333);
  const [drawMode, setDrawMode] = useState<DrawMode>("farm");
  const [boundary, setBoundary] = useState<Coordinate[]>([]);
  const [sectionDraft, setSectionDraft] = useState<Coordinate[]>([]);
  const [sections, setSections] = useState<FarmSection[]>([]);
  const [projectName, setProjectName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionActivity, setSectionActivity] = useState("");
  const [sectionCrop, setSectionCrop] = useState("");
  const [cropOptions, setCropOptions] = useState<string[]>([]);
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);

  useEffect(() => {
    void getProjects().then(setProjects).catch(() => setMessage("Saved farms could not be loaded."));
    void getCrops().then(setCropOptions).catch(() => setCropOptions([]));
  }, []);

  const handleMapClick = (nextLatitude: number, nextLongitude: number) => {
    const point = { latitude: nextLatitude, longitude: nextLongitude };
    if (drawMode === "farm") {
      setBoundary((current) => [...current, point]);
    } else if (drawMode === "section") {
      setSectionDraft((current) => [...current, point]);
    } else {
      setLatitude(nextLatitude);
      setLongitude(nextLongitude);
    }
  };

  const addSection = () => {
    if (sectionDraft.length < 3 || !sectionName.trim() || !sectionActivity.trim()) {
      setMessage("Draw at least three points and enter a section name and activity.");
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
    setDrawMode("farm");
    setMessage("Section added. Save the project to persist it.");
  };

  const save = async () => {
    if (!projectName.trim() || boundary.length < 3) {
      setMessage("Enter a project name and draw at least three farm-boundary points.");
      return;
    }
    try {
      const saved = await createProject({
        name: projectName.trim(),
        center_latitude: latitude,
        center_longitude: longitude,
        boundary,
        sections,
      });
      setProjects((current) => [saved, ...current]);
      setMessage(`Saved ${saved.name} with ${saved.sections.length} sections.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The farm could not be saved.");
    }
  };

  const load = (project: FarmProject) => {
    setProjectName(project.name);
    setLatitude(project.center_latitude);
    setLongitude(project.center_longitude);
    setBoundary(project.boundary);
    setSections(project.sections);
    setSectionDraft([]);
    setFitRequest((request) => request + 1);
    setMessage(`Loaded ${project.name}.`);
  };

  const undoPoint = () => {
    if (drawMode === "section") {
      setSectionDraft((current) => current.slice(0, -1));
    } else if (drawMode === "farm") {
      setBoundary((current) => current.slice(0, -1));
    }
  };

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Farm planning workspace</p>
        <h1>Map the farm. Plan each section.</h1>
        <p>Sketch planning boundaries, assign activities, and save the farm for later review.</p>
        <small>Map drawings are planning sketches, not surveyed or legal property boundaries.</small>
      </section>
      <section className="page-workspace">
        <div className="project-page-grid">
          <div className="project-map-shell">
            <MapContainer center={[latitude, longitude]} zoom={15} className="project-map">
              <ProjectMap
                latitude={latitude}
                longitude={longitude}
                boundary={boundary}
                sectionDraft={sectionDraft}
                sections={sections}
                projectName={projectName}
                fitRequest={fitRequest}
                onClick={handleMapClick}
              />
            </MapContainer>
            <div className="farm-map-tools">
              <button className={drawMode === "location" ? "active" : ""} type="button" onClick={() => setDrawMode("location")}>
                <MapPin size={16} /> Center
              </button>
              <button className={drawMode === "farm" ? "active" : ""} type="button" onClick={() => setDrawMode("farm")}>
                <SquareDashed size={16} /> Farm boundary
              </button>
              <button className={drawMode === "section" ? "active" : ""} type="button" onClick={() => setDrawMode("section")}>
                <Plus size={16} /> Section
              </button>
              <button type="button" onClick={undoPoint} disabled={drawMode === "location" || (drawMode === "farm" ? boundary.length === 0 : sectionDraft.length === 0)}>
                <Undo2 size={16} /> Undo point
              </button>
              <button type="button" onClick={() => setFitRequest((request) => request + 1)}>
                <Focus size={16} /> View bounds
              </button>
              <button type="button" onClick={() => { setBoundary([]); setSections([]); setSectionDraft([]); }}>
                <RotateCcw size={16} /> Clear
              </button>
            </div>
          </div>
          <section className="project-builder panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Current project</p><h2>Farm details</h2></div>
              <Save size={24} />
            </div>
            <div className="project-form">
              <label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Mwangaza Farm" /></label>
              <div className="boundary-summary">
                <span>{boundary.length} farm boundary points</span>
                <button type="button" onClick={() => { setBoundary([]); setSections([]); setSectionDraft([]); }}>Clear drawing</button>
              </div>
              <div className="section-editor">
                <h3>Add a section</h3>
                <label>Section name<input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="e.g. North field" /></label>
                <label>Planned activity<input value={sectionActivity} onChange={(event) => setSectionActivity(event.target.value)} placeholder="e.g. Planting and drip irrigation" /></label>
                <label>Crop or use<input list="project-crops" value={sectionCrop} onChange={(event) => setSectionCrop(event.target.value)} placeholder="e.g. pineapple or pasture" /></label>
                <datalist id="project-crops">{cropOptions.map((crop) => <option key={crop} value={crop} />)}</datalist>
                <div className="boundary-summary"><span>{sectionDraft.length} section points</span><button type="button" onClick={addSection}>Add section</button></div>
              </div>
              <button className="primary-button" type="button" onClick={save}>Save farm project</button>
              {message && <p className="form-message">{message}</p>}
            </div>
          </section>
        </div>
        <section className="panel saved-farms-panel">
          <div className="panel-heading"><div><p className="eyebrow">Portfolio</p><h2>Saved farms</h2></div></div>
          <div className="saved-farm-grid">
            {projects.length === 0 && <p>No farms saved yet.</p>}
            {projects.map((project) => (
              <button type="button" key={project.id} onClick={() => load(project)}>
                <strong>{project.name}</strong>
                <span>{project.sections.length} sections</span>
                <small>Updated {new Date(project.updated_at).toLocaleDateString()}</small>
              </button>
            ))}
          </div>
          {sections.length > 0 && (
            <div className="section-list">
              <h3>Sections in the current project</h3>
              {sections.map((section, index) => (
                <article key={`${section.name}-${index}`}>
                  <strong>{section.name}</strong>
                  <span>{section.activity}</span>
                  {section.crop && <small>{section.crop}</small>}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
