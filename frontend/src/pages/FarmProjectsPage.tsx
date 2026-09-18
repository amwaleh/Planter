import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Check,
  Focus,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  SquareDashed,
  Trash2,
  X,
} from "lucide-react";
import {
  FeatureGroup,
  LayerGroup,
  LayersControl,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  createProject,
  getCrops,
  getProjects,
  searchLocations,
  updateProject,
} from "../api";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import projectIconUrl from "../assets/planter-project-icon.png";
import type {
  Coordinate,
  FarmProject,
  FarmSection,
  LocationMatch,
} from "../types";
import { useAuth } from "../auth-context";

type DrawKind = "farm" | "section";
interface DrawRequest {
  id: number;
  kind: DrawKind;
}

interface ParcelFocusRequest {
  id: number;
  index: number;
}

const projectMarkerIcon = L.divIcon({
  className: "project-marker",
  html: `<img src="${projectIconUrl}" alt="" aria-hidden="true" />`,
  iconSize: [44, 44],
  iconAnchor: [22, 42],
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

function pointIsInsideBoundary(
  point: Coordinate,
  boundary: Coordinate[],
): boolean {
  const onBoundary = boundary.some((currentPoint, index) => {
    const nextPoint = boundary[(index + 1) % boundary.length];
    const crossProduct =
      (point.latitude - currentPoint.latitude) *
        (nextPoint.longitude - currentPoint.longitude) -
      (point.longitude - currentPoint.longitude) *
        (nextPoint.latitude - currentPoint.latitude);
    if (Math.abs(crossProduct) > 1e-9) return false;
    return (
      point.latitude >= Math.min(currentPoint.latitude, nextPoint.latitude) - 1e-9 &&
      point.latitude <= Math.max(currentPoint.latitude, nextPoint.latitude) + 1e-9 &&
      point.longitude >= Math.min(currentPoint.longitude, nextPoint.longitude) - 1e-9 &&
      point.longitude <= Math.max(currentPoint.longitude, nextPoint.longitude) + 1e-9
    );
  });
  if (onBoundary) return true;

  let inside = false;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index++) {
    const currentPoint = boundary[index];
    const previousPoint = boundary[previous];
    const intersects =
      currentPoint.latitude > point.latitude !== previousPoint.latitude > point.latitude &&
      point.longitude <
        ((previousPoint.longitude - currentPoint.longitude) *
          (point.latitude - currentPoint.latitude)) /
          (previousPoint.latitude - currentPoint.latitude) +
          currentPoint.longitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

function sectionIsInsideFarm(
  sectionBoundary: Coordinate[],
  farmBoundaries: Coordinate[][],
): boolean {
  return farmBoundaries.some((farmBoundary) =>
    sectionBoundary.every((point) => pointIsInsideBoundary(point, farmBoundary)),
  );
}

function boundaryCenter(boundary: Coordinate[]): Coordinate {
  return boundary.reduce(
    (center, point) => ({
      latitude: center.latitude + point.latitude / boundary.length,
      longitude: center.longitude + point.longitude / boundary.length,
    }),
    { latitude: 0, longitude: 0 },
  );
}

function parcelPlan(boundary: Coordinate[], sections: FarmSection[]) {
  const parcelSections = sections.filter((section) =>
    sectionIsInsideFarm(section.boundary, [boundary]),
  );
  return {
    activities: Array.from(
      new Set(parcelSections.map((section) => section.activity.trim()).filter(Boolean)),
    ),
    crops: Array.from(
      new Set(parcelSections.map((section) => section.crop?.trim()).filter(Boolean)),
    ),
  };
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
      if (points.length >= 3) {
        onCreated(request.kind, points);
        requestAnimationFrame(() => {
          if (map.hasLayer(event.layer)) map.removeLayer(event.layer);
        });
      } else {
        map.removeLayer(event.layer);
      }
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
  boundaries,
  sectionDraft,
  sections,
  projectName,
  fitRequest,
  centerFocusRequest,
  parcelFocusRequest,
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
  boundaries: Coordinate[][];
  sectionDraft: Coordinate[];
  sections: FarmSection[];
  projectName: string;
  fitRequest: number;
  centerFocusRequest: number;
  parcelFocusRequest: ParcelFocusRequest | null;
  locationMode: boolean;
  drawRequest: DrawRequest | null;
  cancelRequest: number;
  resetEditRequest: number;
  geometryKey: string;
  onCenterChange: (latitude: number, longitude: number) => void;
  onShapeCreated: (kind: DrawKind, points: Coordinate[]) => void;
  onDrawEnded: () => void;
  onBoundaryChange: (index: number, points: Coordinate[]) => void;
  onSectionChange: (index: number, points: Coordinate[]) => void;
}) {
  const map = useMap();
  const positions = (points: Coordinate[]) =>
    points.map((point) => [point.latitude, point.longitude] as [number, number]);

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

  useEffect(() => {
    if (centerFocusRequest === 0) return;
    map.flyTo([latitude, longitude], 18, { duration: 0.45 });
  }, [centerFocusRequest, latitude, longitude, map]);

  useEffect(() => {
    if (fitRequest === 0) return;
    const points = [
      [latitude, longitude] as [number, number],
      ...boundaries.flatMap(positions),
      ...positions(sectionDraft),
      ...sections.flatMap((section) => positions(section.boundary)),
    ];
    if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 18 });
    }
  }, [boundaries, fitRequest, latitude, longitude, map, sectionDraft, sections]);

  useEffect(() => {
    if (!parcelFocusRequest) return;
    const boundary = boundaries[parcelFocusRequest.index];
    if (!boundary) return;
    map.fitBounds(L.latLngBounds(positions(boundary)), {
      padding: [48, 48],
      maxZoom: 18,
    });
  }, [boundaries, map, parcelFocusRequest]);

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
        <LayersControl.BaseLayer checked name="Satellite imagery">
          <TileLayer
            attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Street roads and boundaries">
          <TileLayer
            attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain map">
          <TileLayer
            attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Roads, boundaries and place names">
          <LayerGroup>
            <TileLayer
              attribution='Reference layers &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, OpenStreetMap contributors, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              opacity={0.9}
            />
            <TileLayer
              attribution='Reference layers &copy; <a href="https://www.esri.com/">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayerGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm centres">
          <FeatureGroup>
            {boundaries.length === 0 && (
              <Marker
                position={[latitude, longitude]}
                icon={projectMarkerIcon}
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
                <Popup minWidth={250} maxWidth={310}>
                  <div className="project-marker-popup">
                    <div className="project-popup-heading">
                      <img src={projectIconUrl} alt="" aria-hidden="true" />
                      <div>
                        <span>Unsaved farm draft</span>
                        <strong>{projectName.trim() || "Unnamed farm"}</strong>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>Starting centre</dt>
                        <dd>{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd>
                      </div>
                    </dl>
                    <p>Drag this marker or use <strong>Move centre</strong> before drawing a parcel.</p>
                  </div>
                </Popup>
              </Marker>
            )}
            {boundaries.map((boundary, index) => {
              const center = boundaryCenter(boundary);
              const plan = parcelPlan(boundary, sections);
              return (
                <Marker
                  key={`parcel-marker-${geometryKey}-${index}`}
                  position={[center.latitude, center.longitude]}
                  icon={projectMarkerIcon}
                  bubblingMouseEvents={false}
                >
                  <Tooltip>
                    {projectName.trim() || "Farm"} · parcel {index + 1}
                  </Tooltip>
                  <Popup minWidth={250} maxWidth={310}>
                    <div className="project-marker-popup">
                      <div className="project-popup-heading">
                        <img src={projectIconUrl} alt="" aria-hidden="true" />
                        <div>
                          <span>{geometryKey === "new" ? "Unsaved parcel" : "Saved farm parcel"}</span>
                          <strong>{projectName.trim() || "Unnamed farm"} · Parcel {index + 1}</strong>
                        </div>
                      </div>
                      <dl>
                        <div>
                          <dt>Planned activity</dt>
                          <dd>{plan.activities.slice(0, 3).join(", ") || "----"}</dd>
                        </div>
                        <div>
                          <dt>Crop or use</dt>
                          <dd>{plan.crops.slice(0, 3).join(", ") || "----"}</dd>
                        </div>
                      </dl>
                      <p>This marker follows the parcel boundary when it is edited.</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm boundary">
          <FeatureGroup>
            {boundaries.map((boundary, index) => (
              <Polygon
                key={`farm-${geometryKey}-${index}`}
                positions={positions(boundary)}
                interactive={!drawRequest}
                pathOptions={{ color: "#ffd34d", weight: 4, fillColor: "#173f2a", fillOpacity: 0.2 }}
                eventHandlers={{
                  "pm:edit": (event) => onBoundaryChange(index, coordinatesFromLayer(event.layer)),
                }}
              >
                <Tooltip sticky>
                  {projectName.trim() || "Farm"} · parcel {index + 1}
                </Tooltip>
              </Polygon>
            ))}
          </FeatureGroup>
        </LayersControl.Overlay>
        <LayersControl.Overlay checked name="Farm sections">
          <FeatureGroup>
            {sections.map((section, index) => (
              <Polygon
                key={`${geometryKey}-${section.name}-${index}`}
                positions={positions(section.boundary)}
                interactive={!drawRequest}
                pathOptions={{
                  color: index % 2 === 0 ? "#e8b449" : "#72523f",
                  fillOpacity: 0.28,
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
  const [boundaries, setBoundaries] = useState<Coordinate[][]>([]);
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
  const [centerFocusRequest, setCenterFocusRequest] = useState(0);
  const [parcelFocusRequest, setParcelFocusRequest] = useState<ParcelFocusRequest | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeMatches, setPlaceMatches] = useState<LocationMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef(0);

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
    setCenterFocusRequest((request) => request + 1);
    setMessage("Farm centre updated.");
  }, []);

  const searchForPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (placeQuery.trim().length < 2) {
      setMessage("Enter at least two characters to search for a place.");
      return;
    }
    setSearching(true);
    setMessage(null);
    const requestId = ++searchRequest.current;
    try {
      const matches = await searchLocations(placeQuery.trim());
      if (requestId === searchRequest.current) setPlaceMatches(matches);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Location search is temporarily unavailable.",
      );
    } finally {
      if (requestId === searchRequest.current) setSearching(false);
    }
  };

  const choosePlace = (match: LocationMatch) => {
    setCenter(match.latitude, match.longitude);
    setPlaceQuery([match.name, match.admin2, match.admin1].filter(Boolean).join(", "));
    setPlaceMatches([]);
  };

  const finishDrawing = useCallback((kind: DrawKind, points: Coordinate[]) => {
    if (kind === "farm") {
      setBoundaries((current) => [...current, points]);
      setMessage("Farm parcel captured. Draw another parcel or add sections.");
      const center = points.reduce(
        (total, point) => ({
          latitude: total.latitude + point.latitude / points.length,
          longitude: total.longitude + point.longitude / points.length,
        }),
        { latitude: 0, longitude: 0 },
      );
      setLatitude(center.latitude);
      setLongitude(center.longitude);
      setFitRequest((request) => request + 1);
    } else {
      setSectionDraft(points);
      setMessage("Section shape captured. Add its name and activity, then choose Add section.");
    }
    setDrawRequest(null);
    setLocationMode(false);
  }, []);

  const endDrawing = useCallback(() => setDrawRequest(null), []);

  const startDrawing = (kind: DrawKind) => {
    if (kind === "section" && boundaries.length === 0) {
      setMessage("Draw at least one farm parcel before adding sections.");
      return;
    }
    setLocationMode(false);
    setDrawRequest({ id: Date.now(), kind });
    setMessage(
      `Draw the ${kind === "farm" ? "farm boundary" : "section"} on the map. Tap the first point or press Enter to finish.`,
    );
  };

  const addSection = async () => {
    if (saving) return;
    if (sectionDraft.length < 3 || !sectionName.trim() || !sectionActivity.trim()) {
      setMessage("Draw a section and enter its name and planned activity.");
      return;
    }
    if (!projectName.trim()) {
      setMessage("Enter a project name before adding the section.");
      return;
    }
    if (!sectionIsInsideFarm(sectionDraft, boundaries)) {
      setMessage("The section must be fully inside one farm parcel.");
      return;
    }
    const nextSections = [
      ...sections,
      {
        name: sectionName.trim(),
        activity: sectionActivity.trim(),
        crop: sectionCrop.trim() || null,
        boundary: sectionDraft,
      },
    ];
    const payload = {
      name: projectName.trim(),
      center_latitude: latitude,
      center_longitude: longitude,
      boundaries,
      sections: nextSections,
    };
    try {
      setSaving(true);
      const accessToken = await getAccessToken();
      const saved = activeProjectId
        ? await updateProject(activeProjectId, payload, accessToken)
        : await createProject(payload, accessToken);
      setActiveProjectId(saved.id);
      setSections(saved.sections);
      setProjects((current) => {
        const remaining = current.filter((project) => project.id !== saved.id);
        return [saved, ...remaining];
      });
      setSectionDraft([]);
      setSectionName("");
      setSectionActivity("");
      setSectionCrop("");
      setMessage(`Section added and ${saved.name} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The section could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    if (!projectName.trim() || boundaries.length === 0) {
      setMessage("Enter a project name and draw at least one farm parcel before saving.");
      return;
    }
    if (sections.some((section) => !sectionIsInsideFarm(section.boundary, boundaries))) {
      setMessage("Every section must remain fully inside one farm parcel before saving.");
      return;
    }
    const payload = {
      name: projectName.trim(),
      center_latitude: latitude,
      center_longitude: longitude,
      boundaries,
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
    setBoundaries(project.boundaries);
    setSections(project.sections);
    setSectionDraft([]);
    setDrawRequest(null);
    setLocationMode(false);
    setResetEditRequest((request) => request + 1);
    setCenterFocusRequest((request) => request + 1);
    setMessage(`Loaded ${project.name}. Map shapes and activities are ready to edit.`);
  };

  const newProject = () => {
    if (saving) return;
    setActiveProjectId(null);
    setProjectName("");
    setBoundaries([]);
    setSections([]);
    setSectionDraft([]);
    setDrawRequest(null);
    setResetEditRequest((request) => request + 1);
    setMessage("Started a new farm project.");
  };

  const updateFarmBoundary = useCallback((index: number, points: Coordinate[]) => {
    setBoundaries((current) =>
      current.map((boundary, boundaryIndex) =>
        boundaryIndex === index ? points : boundary,
      ),
    );
  }, []);

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
          <span className={boundaries.length > 0 ? "complete" : "active"}><strong>1</strong> Draw farm</span>
          <span className={sections.length > 0 ? "complete" : boundaries.length > 0 ? "active" : ""}><strong>2</strong> Add sections</span>
          <span className={activeProjectId ? "complete" : sections.length > 0 ? "active" : ""}><strong>3</strong> Save project</span>
        </div>
        <div className="project-page-grid">
          <div className="project-map-shell">
            <MapContainer center={[latitude, longitude]} zoom={15} className="project-map">
              <ProjectMap
                latitude={latitude}
                longitude={longitude}
                boundaries={boundaries}
                sectionDraft={sectionDraft}
                sections={sections}
                projectName={projectName}
                fitRequest={fitRequest}
                centerFocusRequest={centerFocusRequest}
                parcelFocusRequest={parcelFocusRequest}
                locationMode={locationMode}
                drawRequest={drawRequest}
                cancelRequest={cancelRequest}
                resetEditRequest={resetEditRequest}
                geometryKey={activeProjectId ?? "new"}
                onCenterChange={setCenter}
                onShapeCreated={finishDrawing}
                onDrawEnded={endDrawing}
                onBoundaryChange={updateFarmBoundary}
                onSectionChange={updateSectionBoundary}
              />
            </MapContainer>
            <form className="map-search project-map-search" onSubmit={searchForPlace}>
              <Search size={18} />
              <input
                aria-label="Search for an Eastern Africa place"
                placeholder="Search town, village, or place"
                value={placeQuery}
                onChange={(event) => setPlaceQuery(event.target.value)}
              />
              <button type="submit" aria-label="Search places" disabled={searching}>
                {searching ? <LoaderCircle className="spin" size={18} /> : "Find"}
              </button>
              {placeMatches.length > 0 && (
                <div className="search-results">
                  {placeMatches.map((match) => (
                    <button
                      key={`${match.name}-${match.latitude}-${match.longitude}`}
                      type="button"
                      onClick={() => choosePlace(match)}
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
            <div className="farm-map-tools">
              <button
                className={locationMode ? "active" : ""}
                type="button"
                onClick={() => {
                  setDrawRequest(null);
                  setLocationMode(true);
                  setCenterFocusRequest((request) => request + 1);
                  setMessage("The map is focused on the centre. Tap to move it, or drag the marker.");
                }}
              >
                <MapPin size={16} /> Move centre
              </button>
              <button className={drawRequest?.kind === "farm" ? "active" : ""} type="button" onClick={() => startDrawing("farm")}>
                <SquareDashed size={16} /> Draw farm
              </button>
              <button className={drawRequest?.kind === "section" ? "active" : ""} type="button" onClick={() => startDrawing("section")} disabled={boundaries.length === 0}>
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
                <span>{boundaries.length > 0 ? `${boundaries.length} farm parcel${boundaries.length === 1 ? "" : "s"} captured` : "No farm parcels yet"}</span>
              </div>
              {boundaries.map((boundary, index) => {
                const plan = parcelPlan(boundary, sections);
                return (
                  <div className="boundary-summary" key={`boundary-${index}`}>
                    <button
                      className="boundary-focus-link"
                      type="button"
                      onClick={() => setParcelFocusRequest({ id: Date.now(), index })}
                    >
                      <MapPin size={14} />
                      <span>
                        <strong>Parcel {index + 1}</strong>
                        <small>
                          {plan.activities[0] || "----"} · {plan.crops[0] || "----"}
                        </small>
                      </span>
                    </button>
                    <div className="boundary-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = boundaries.filter((_, boundaryIndex) => boundaryIndex !== index);
                          if (sections.some((section) => !sectionIsInsideFarm(section.boundary, remaining))) {
                            setMessage("Remove or move sections in this parcel before removing it.");
                            return;
                          }
                          setBoundaries(remaining);
                        }}
                      >
                        Remove parcel
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="section-editor">
                <h3>Add a farm section</h3>
                {sectionDraft.length < 3 ? (
                  <button className="secondary-button" type="button" onClick={() => startDrawing("section")} disabled={boundaries.length === 0}>
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
                  <button type="button" onClick={() => void addSection()} disabled={sectionDraft.length < 3 || saving}>
                    {saving ? "Saving..." : "Add section"}
                  </button>
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
                <span className="saved-farm-title">
                  <img src={projectIconUrl} alt="" aria-hidden="true" />
                  <strong>{project.name}</strong>
                </span>
                <span>{project.boundaries.length} parcels · {project.sections.length} sections</span>
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
