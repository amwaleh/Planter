import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Check,
  Focus,
  MapPin,
  Pencil,
  Plus,
  Save,
  SquareDashed,
  Trash2,
  X,
} from "lucide-react";
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
import { createProject, getCrops, getProjects, updateProject } from "../api";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { Coordinate, FarmProject, FarmSection } from "../types";
import { useAuth } from "../auth-context";

type DrawKind = "farm" | "section";
interface DrawRequest {
  id: number;
  kind: DrawKind;
}

const markerIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function coordinatesFromLayer(layer: L.Layer): Coordinate[] {
  if (!(layer instanceof L.Polygon)) return [];
  const latLngs = layer.getLatLngs();
  const ring = (Array.isArray(latLngs[0]) ? latLngs[0] : latLngs) as L.LatLng[];
  return ring.map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

function GeomanController({
  request,
  cancelRequest,
  resetEditRequest,
  onCreated,
  onDrawEnded,
}: {
  request: DrawRequest | null;
  cancelRequest: number;
  resetEditRequest: number;
  onCreated: (kind: DrawKind, points: Coordinate[]) => void;
  onDrawEnded: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.pm.addControls({
      position: "topleft",
      drawControls: false,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      continueDrawing: false,
      finishOnEnter: true,
      snappable: true,
    });
    return () => {
      map.pm.disableDraw();
      map.pm.removeControls();
    };
  }, [map]);

  useEffect(() => {
    if (!request) return;
    map.pm.disableGlobalEditMode();
    map.pm.enableDraw("Polygon", {
      allowSelfIntersection: false,
      finishOn: "dblclick",
      snappable: true,
    });

    const handleCreate = (event: L.LeafletEvent & { layer: L.Layer }) => {
      const points = coordinatesFromLayer(event.layer);
      map.removeLayer(event.layer);
      if (points.length >= 3) onCreated(request.kind, points);
      map.pm.disableDraw();
    };
    const handleDrawEnd = () => onDrawEnded();
    map.once("pm:create", handleCreate);
    map.once("pm:drawend", handleDrawEnd);
    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:drawend", handleDrawEnd);
      map.pm.disableDraw();
    };
  }, [map, onCreated, onDrawEnded, request]);

  useEffect(() => {
    if (cancelRequest === 0) return;
    map.pm.disableDraw();
    onDrawEnded();
  }, [cancelRequest, map, onDrawEnded]);

  useEffect(() => {
    if (resetEditRequest === 0) return;
    map.pm.disableGlobalEditMode();
  }, [map, resetEditRequest]);

  return null;
}

function ProjectMap({
  latitude,
  longitude,
  boundary,
  sectionDraft,
  sections,
  projectName,
  fitRequest,
  locationMode,
  drawRequest,
  cancelRequest,
  resetEditRequest,
  geometryKey,
  onCenterChange,
  onShapeCreated,
  onDrawEnded,
  onBoundaryChange,
  onSectionChange,
}: {
  latitude: number;
  longitude: number;
  boundary: Coordinate[];
  sectionDraft: Coordinate[];
  sections: FarmSection[];
  projectName: string;
  fitRequest: number;
  locationMode: boolean;
  drawRequest: DrawRequest | null;
  cancelRequest: number;
  resetEditRequest: number;
  geometryKey: string;
  onCenterChange: (latitude: number, longitude: number) => void;
  onShapeCreated: (kind: DrawKind, points: Coordinate[]) => void;
  onDrawEnded: () => void;
  onBoundaryChange: (points: Coordinate[]) => void;
  onSectionChange: (index: number, points: Coordinate[]) => void;
}) {
  const map = useMap();
  const positions = (points: Coordinate[]) =>
    points.map((point) => [point.latitude, point.longitude] as [number, number]);

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

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

  useMapEvents({
    click(event) {
      if (locationMode && !drawRequest) {
        onCenterChange(event.latlng.lat, event.latlng.lng);
      }
    },
  });

  return (
    <>
      <GeomanController
        request={drawRequest}
        cancelRequest={cancelRequest}
        resetEditRequest={resetEditRequest}
        onCreated={onShapeCreated}
        onDrawEnded={onDrawEnded}
      />
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
            <Marker
              position={[latitude, longitude]}
              icon={markerIcon}
              draggable
              bubblingMouseEvents={false}
              eventHandlers={{
                dragend(event) {
                  const point = event.target.getLatLng();
                  onCenterChange(point.lat, point.lng);
                },
              }}
            >
              <Tooltip>{projectName.trim() || "Farm centre"}</Tooltip>
              <Popup>
                <strong>{projectName.trim() || "Farm centre"}</strong>
                <br />
                Drag this marker or choose Move centre.
                <br />
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </Popup>
            </Marker>
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm boundary">
          <FeatureGroup>
            {boundary.length >= 2 && (
              <Polyline
                positions={positions(boundary)}
                pathOptions={{ color: "#173f2a", weight: 3, bubblingMouseEvents: false, pmIgnore: true }}
              />
            )}
            {boundary.length >= 3 && (
              <Polygon
                key={`farm-${geometryKey}`}
                positions={positions(boundary)}
                pathOptions={{ color: "#173f2a", fillColor: "#4f7b52", fillOpacity: 0.12, bubblingMouseEvents: false }}
                eventHandlers={{
                  "pm:edit": (event) => onBoundaryChange(coordinatesFromLayer(event.layer)),
                }}
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
                key={`${geometryKey}-${section.name}-${index}`}
                positions={positions(section.boundary)}
                pathOptions={{
                  color: index % 2 === 0 ? "#e8b449" : "#72523f",
                  fillOpacity: 0.28,
                  bubblingMouseEvents: false,
                }}
                eventHandlers={{
                  "pm:edit": (event) => onSectionChange(index, coordinatesFromLayer(event.layer)),
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
        <LayersControl.Overlay checked name="Section draft">
          <FeatureGroup>
            {sectionDraft.length >= 3 && (
              <Polygon
                positions={positions(sectionDraft)}
                pathOptions={{ color: "#d36d3c", dashArray: "7 5", fillOpacity: 0.18, pmIgnore: true }}
              >
                <Tooltip sticky>Unsaved section</Tooltip>
              </Polygon>
            )}
          </FeatureGroup>
        </LayersControl.Overlay>
      </LayersControl>
    </>
  );
}

export default function FarmProjectsPage() {
  const {
    account,
    configured,
    initializing,
    signIn,
    signUp,
    getAccessToken,
  } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [latitude, setLatitude] = useState(-0.7167);
  const [longitude, setLongitude] = useState(36.4333);
  const [locationMode, setLocationMode] = useState(false);
  const [drawRequest, setDrawRequest] = useState<DrawRequest | null>(null);
  const [cancelRequest, setCancelRequest] = useState(0);
  const [resetEditRequest, setResetEditRequest] = useState(0);
  const [boundary, setBoundary] = useState<Coordinate[]>([]);
  const [sectionDraft, setSectionDraft] = useState<Coordinate[]>([]);
  const [sections, setSections] = useState<FarmSection[]>([]);
  const [projectName, setProjectName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionActivity, setSectionActivity] = useState("");
  const [sectionCrop, setSectionCrop] = useState("");
  const [cropOptions, setCropOptions] = useState<string[]>([]);
  const [projects, setProjects] = useState<FarmProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getCrops().then(setCropOptions).catch(() => setCropOptions([]));
  }, []);

  useEffect(() => {
    if (!account) {
      setProjects([]);
      return;
    }
    void getAccessToken()
      .then(getProjects)
      .then(setProjects)
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Saved farms could not be loaded."),
      );
  }, [account, getAccessToken]);

  const setCenter = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setLocationMode(false);
    setMessage("Farm centre updated.");
  }, []);

  const finishDrawing = useCallback((kind: DrawKind, points: Coordinate[]) => {
    if (kind === "farm") {
      if (sections.length > 0) {
        setSections([]);
        setMessage("New farm boundary captured. Existing sections were cleared; redraw them inside this boundary.");
      } else {
        setMessage("Farm boundary captured. You can edit it with the map edit control.");
      }
      setBoundary(points);
      const center = points.reduce(
        (total, point) => ({
          latitude: total.latitude + point.latitude / points.length,
          longitude: total.longitude + point.longitude / points.length,
        }),
        { latitude: 0, longitude: 0 },
      );
      setLatitude(center.latitude);
      setLongitude(center.longitude);
    } else {
      setSectionDraft(points);
      setMessage("Section shape captured. Add its name and activity, then choose Add section.");
    }
    setDrawRequest(null);
    setLocationMode(false);
    setFitRequest((request) => request + 1);
  }, [sections.length]);

  const endDrawing = useCallback(() => setDrawRequest(null), []);

  const startDrawing = (kind: DrawKind) => {
    if (kind === "section" && boundary.length < 3) {
      setMessage("Draw the farm boundary before adding sections.");
      return;
    }
    setLocationMode(false);
    setDrawRequest({ id: Date.now(), kind });
    setMessage(
      `Draw the ${kind === "farm" ? "farm boundary" : "section"} on the map. Tap the first point or press Enter to finish.`,
    );
  };

  const addSection = () => {
    if (sectionDraft.length < 3 || !sectionName.trim() || !sectionActivity.trim()) {
      setMessage("Draw a section and enter its name and planned activity.");
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
    setMessage("Section added to this project. Save the project to persist it.");
  };

  const save = async () => {
    if (saving) return;
    if (!projectName.trim() || boundary.length < 3) {
      setMessage("Enter a project name and draw the farm boundary before saving.");
      return;
    }
    const payload = {
      name: projectName.trim(),
      center_latitude: latitude,
      center_longitude: longitude,
      boundary,
      sections,
    };
    try {
      setSaving(true);
      const accessToken = await getAccessToken();
      const saved = activeProjectId
        ? await updateProject(activeProjectId, payload, accessToken)
        : await createProject(payload, accessToken);
      setActiveProjectId(saved.id);
      setProjects((current) => {
        const remaining = current.filter((project) => project.id !== saved.id);
        return [saved, ...remaining];
      });
      setMessage(`${saved.name} saved with ${saved.sections.length} section${saved.sections.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The farm could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const load = (project: FarmProject) => {
    if (saving) return;
    setActiveProjectId(project.id);
    setProjectName(project.name);
    setLatitude(project.center_latitude);
    setLongitude(project.center_longitude);
    setBoundary(project.boundary);
    setSections(project.sections);
    setSectionDraft([]);
    setDrawRequest(null);
    setLocationMode(false);
    setResetEditRequest((request) => request + 1);
    setFitRequest((request) => request + 1);
    setMessage(`Loaded ${project.name}. Map shapes and activities are ready to edit.`);
  };

  const newProject = () => {
    if (saving) return;
    setActiveProjectId(null);
    setProjectName("");
    setBoundary([]);
    setSections([]);
    setSectionDraft([]);
    setDrawRequest(null);
    setResetEditRequest((request) => request + 1);
    setMessage("Started a new farm project.");
  };

  const updateSectionBoundary = useCallback((index: number, points: Coordinate[]) => {
    setSections((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, boundary: points } : section,
      ),
    );
  }, []);

  const submitAuthentication = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (authMode === "signup") {
        await signUp(authEmail.trim(), authPassword);
      } else {
        await signIn(authEmail.trim(), authPassword);
      }
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  if (initializing) {
    return (
      <main>
        <SiteHeader />
        <section className="auth-gate"><p>Checking your sign-in...</p></section>
        <SiteFooter />
      </main>
    );
  }

  if (!configured || !account) {
    return (
      <main>
        <SiteHeader />
        <section className="auth-gate">
          <p className="kicker">Private farm workspace</p>
          <h1>Sign in to save and manage farm projects.</h1>
          <p>Your farm boundaries, sections, and activities are private to your account.</p>
          {configured ? (
            <>
              <div className="auth-mode-switch">
                <button
                  className={authMode === "login" ? "active" : ""}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  Log in
                </button>
                <button
                  className={authMode === "signup" ? "active" : ""}
                  type="button"
                  onClick={() => setAuthMode("signup")}
                >
                  Create account
                </button>
              </div>
              <form className="auth-form" onSubmit={submitAuthentication}>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    minLength={8}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                  />
                </label>
                <button className="primary-button" type="submit" disabled={authBusy}>
                  {authBusy
                    ? "Please wait..."
                    : authMode === "signup"
                      ? "Create account"
                      : "Log in"}
                </button>
                {authMessage && <p className="form-message">{authMessage}</p>}
              </form>
            </>
          ) : (
            <p className="form-message">
              Account signup requires a configured Planter API for this deployment.
            </p>
          )}
        </section>
        <SiteFooter />
      </main>
    );
  }

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Farm planning workspace</p>
        <h1>Draw the farm. Divide it into working sections.</h1>
        <p>Use the guided map tools to create, edit, save, and reload a practical farm plan.</p>
        <small>Map drawings are planning sketches, not surveyed or legal property boundaries.</small>
      </section>
      <section className="page-workspace">
        <div className="project-steps" aria-label="Farm project steps">
          <span className={boundary.length >= 3 ? "complete" : "active"}><strong>1</strong> Draw farm</span>
          <span className={sections.length > 0 ? "complete" : boundary.length >= 3 ? "active" : ""}><strong>2</strong> Add sections</span>
          <span className={activeProjectId ? "complete" : sections.length > 0 ? "active" : ""}><strong>3</strong> Save project</span>
        </div>
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
                locationMode={locationMode}
                drawRequest={drawRequest}
                cancelRequest={cancelRequest}
                resetEditRequest={resetEditRequest}
                geometryKey={activeProjectId ?? "new"}
                onCenterChange={setCenter}
                onShapeCreated={finishDrawing}
                onDrawEnded={endDrawing}
                onBoundaryChange={setBoundary}
                onSectionChange={updateSectionBoundary}
              />
            </MapContainer>
            <div className="farm-map-tools">
              <button
                className={locationMode ? "active" : ""}
                type="button"
                onClick={() => {
                  setDrawRequest(null);
                  setLocationMode(true);
                  setMessage("Tap the map to move the farm centre, or drag the marker.");
                }}
              >
                <MapPin size={16} /> Move centre
              </button>
              <button className={drawRequest?.kind === "farm" ? "active" : ""} type="button" onClick={() => startDrawing("farm")}>
                <SquareDashed size={16} /> Draw farm
              </button>
              <button className={drawRequest?.kind === "section" ? "active" : ""} type="button" onClick={() => startDrawing("section")} disabled={boundary.length < 3}>
                <Plus size={16} /> Draw section
              </button>
              {drawRequest && (
                <button type="button" onClick={() => setCancelRequest((request) => request + 1)}>
                  <X size={16} /> Cancel drawing
                </button>
              )}
              <button type="button" onClick={() => setFitRequest((request) => request + 1)}>
                <Focus size={16} /> View all
              </button>
            </div>
            <div className="map-help">
              <Pencil size={15} />
              <span>Finish a shape by tapping its first point or pressing Enter. Use the edit control at top left to move vertices.</span>
            </div>
          </div>
          <section className="project-builder panel">
            <div className="panel-heading">
              <div><p className="eyebrow">{activeProjectId ? "Editing saved project" : "New project"}</p><h2>Farm details</h2></div>
              <Save size={24} />
            </div>
            <div className="project-form">
              <label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Mwangaza Farm" /></label>
              <div className="boundary-summary">
                <span>{boundary.length >= 3 ? `${boundary.length} boundary points captured` : "No farm boundary yet"}</span>
                {boundary.length >= 3 && <button type="button" onClick={() => { setBoundary([]); setSections([]); setSectionDraft([]); }}>Remove farm shape</button>}
              </div>
              <div className="section-editor">
                <h3>Add a farm section</h3>
                {sectionDraft.length < 3 ? (
                  <button className="secondary-button" type="button" onClick={() => startDrawing("section")} disabled={boundary.length < 3}>
                    <SquareDashed size={16} /> Draw section shape
                  </button>
                ) : (
                  <p className="shape-ready"><Check size={16} /> Section shape ready</p>
                )}
                <label>Section name<input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder="e.g. North field" /></label>
                <label>Planned activity<input value={sectionActivity} onChange={(event) => setSectionActivity(event.target.value)} placeholder="e.g. Planting and drip irrigation" /></label>
                <label>Crop or use<input list="project-crops" value={sectionCrop} onChange={(event) => setSectionCrop(event.target.value)} placeholder="e.g. pineapple or pasture" /></label>
                <datalist id="project-crops">{cropOptions.map((crop) => <option key={crop} value={crop} />)}</datalist>
                <div className="form-actions">
                  {sectionDraft.length >= 3 && <button type="button" onClick={() => setSectionDraft([])}>Redraw</button>}
                  <button type="button" onClick={addSection} disabled={sectionDraft.length < 3}>Add section</button>
                </div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={newProject} disabled={saving}>New project</button>
                <button className="primary-button" type="button" onClick={save} disabled={saving}>
                  {saving ? "Saving..." : activeProjectId ? "Save changes" : "Save farm project"}
                </button>
              </div>
              {message && <p className="form-message" role="status">{message}</p>}
            </div>
          </section>
        </div>
        <section className="panel saved-farms-panel">
          <div className="panel-heading"><div><p className="eyebrow">Portfolio</p><h2>Saved farms</h2></div></div>
          <div className="saved-farm-grid">
            {projects.length === 0 && <p>No farms saved yet.</p>}
            {projects.map((project) => (
              <button className={project.id === activeProjectId ? "active" : ""} type="button" key={project.id} onClick={() => load(project)} disabled={saving}>
                <strong>{project.name}</strong>
                <span>{project.boundary.length} boundary points · {project.sections.length} sections</span>
                <small>Updated {new Date(project.updated_at).toLocaleString()}</small>
              </button>
            ))}
          </div>
          {sections.length > 0 && (
            <div className="section-list">
              <h3>Sections in the current project</h3>
              {sections.map((section, index) => (
                <article key={`${section.name}-${index}`}>
                  <div>
                    <strong>{section.name}</strong>
                    <span>{section.activity}</span>
                    {section.crop && <small>{section.crop}</small>}
                  </div>
                  <button type="button" aria-label={`Remove ${section.name}`} onClick={() => setSections((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 size={16} />
                  </button>
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
