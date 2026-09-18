import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  Check,
  Focus,
  Info,
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
  FarmMarker,
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

const markerSymbols: Record<string, string> = {
  Water: "W",
  Gate: "G",
  Building: "B",
  Storage: "S",
  Livestock: "L",
  Equipment: "E",
  Hazard: "!",
  Other: "•",
};

const projectMarkerIcon = L.divIcon({
  className: "project-marker",
  html: `<img src="${projectIconUrl}" alt="" aria-hidden="true" />`,
  iconSize: [44, 44],
  iconAnchor: [22, 42],
});

function customMarkerIcon(
  category: string,
  color = "#4f7b52",
  imageDataUrl: string | null = null,
  draft = false,
) {
  if (imageDataUrl?.match(/^data:image\/(?:png|jpeg|webp|gif);base64,/)) {
    return L.icon({
      iconUrl: imageDataUrl,
      className: `custom-image-marker${draft ? " marker-draft-icon" : ""}`,
      iconSize: [42, 42],
      iconAnchor: [21, 40],
      popupAnchor: [0, -36],
    });
  }
  const symbol = markerSymbols[category] ?? markerSymbols.Other;
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#4f7b52";
  return L.divIcon({
    className: `custom-farm-marker${draft ? " marker-draft-icon" : ""}`,
    html: `<span style="--marker-color:${safeColor}">${symbol}</span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  });
}

function createMarkerId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `marker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function MarkerDraftForm({
  position,
  name,
  category,
  notes,
  color,
  imageDataUrl,
  editing,
  saving,
  onNameChange,
  onCategoryChange,
  onNotesChange,
  onColorChange,
  onImageSelected,
  onImageRemove,
  onPositionChange,
  onCancel,
  onSave,
}: {
  position: Coordinate;
  name: string;
  category: string;
  notes: string;
  color: string;
  imageDataUrl: string | null;
  editing: boolean;
  saving: boolean;
  onNameChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onImageSelected: (file: File) => void;
  onImageRemove: () => void;
  onPositionChange: (position: Coordinate) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    markerRef.current?.openPopup();
  }, []);

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={customMarkerIcon(category, color, imageDataUrl, true)}
      draggable
      eventHandlers={{
        dragend(event) {
          const point = event.target.getLatLng();
          onPositionChange({
            latitude: point.lat,
            longitude: point.lng,
          });
        },
      }}
    >
      <Tooltip permanent direction="top">Unsaved marker</Tooltip>
      <Popup
        minWidth={260}
        closeOnClick={false}
        closeButton={false}
        autoClose={false}
        closeOnEscapeKey={false}
        autoPan
      >
        <form
          className="marker-popup-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <strong>{editing ? "Edit map marker" : "New map marker"}</strong>
          <label>
            Marker type
            <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
              {Object.keys(markerSymbols).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Marker name
            <input
              autoFocus
              maxLength={100}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Main borehole"
              required
            />
          </label>
          <label>
            Notes
            <textarea
              maxLength={300}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Optional marker details"
              rows={2}
            />
          </label>
          <label>
            Marker color
            <input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} />
          </label>
          <label>
            Marker image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImageSelected(file);
              }}
            />
          </label>
          {imageDataUrl && (
            <div className="marker-image-preview">
              <img src={imageDataUrl} alt="Marker preview" />
              <button type="button" onClick={onImageRemove}>Remove image</button>
            </div>
          )}
          <div className="marker-popup-actions">
            <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save marker"}
            </button>
          </div>
        </form>
      </Popup>
    </Marker>
  );
}

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
  editingSectionIndex,
  markers,
  markerDraftPosition,
  markerName,
  markerCategory,
  markerNotes,
  markerColor,
  markerImageDataUrl,
  editingMarkerIndex,
  saving,
  projectName,
  fitRequest,
  centerFocusRequest,
  parcelFocusRequest,
  locationMode,
  markerPlacement,
  drawRequest,
  cancelRequest,
  resetEditRequest,
  geometryKey,
  onCenterChange,
  onMarkerPositionSelected,
  onMarkerChange,
  onMarkerNameChange,
  onMarkerCategoryChange,
  onMarkerNotesChange,
  onMarkerColorChange,
  onMarkerImageSelected,
  onMarkerImageRemove,
  onMarkerDraftPositionChange,
  onMarkerDraftCancel,
  onMarkerSave,
  onMarkerEdit,
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
  editingSectionIndex: number | null;
  markers: FarmMarker[];
  markerDraftPosition: Coordinate | null;
  markerName: string;
  markerCategory: string;
  markerNotes: string;
  markerColor: string;
  markerImageDataUrl: string | null;
  editingMarkerIndex: number | null;
  saving: boolean;
  projectName: string;
  fitRequest: number;
  centerFocusRequest: number;
  parcelFocusRequest: ParcelFocusRequest | null;
  locationMode: boolean;
  markerPlacement: boolean;
  drawRequest: DrawRequest | null;
  cancelRequest: number;
  resetEditRequest: number;
  geometryKey: string;
  onCenterChange: (latitude: number, longitude: number) => void;
  onMarkerPositionSelected: (position: Coordinate) => void;
  onMarkerChange: (index: number, position: Coordinate) => void;
  onMarkerNameChange: (value: string) => void;
  onMarkerCategoryChange: (value: string) => void;
  onMarkerNotesChange: (value: string) => void;
  onMarkerColorChange: (value: string) => void;
  onMarkerImageSelected: (file: File) => void;
  onMarkerImageRemove: () => void;
  onMarkerDraftPositionChange: (position: Coordinate) => void;
  onMarkerDraftCancel: () => void;
  onMarkerSave: () => void;
  onMarkerEdit: (index: number) => void;
  onShapeCreated: (kind: DrawKind, points: Coordinate[]) => void;
  onDrawEnded: () => void;
  onBoundaryChange: (index: number, points: Coordinate[]) => void;
  onSectionChange: (index: number, points: Coordinate[]) => void;
}) {
  const map = useMap();
  const handledFitRequest = useRef(0);
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
    if (fitRequest === 0 || handledFitRequest.current === fitRequest) return;
    handledFitRequest.current = fitRequest;
    const points = [
      [latitude, longitude] as [number, number],
      ...boundaries.flatMap(positions),
      ...positions(sectionDraft),
      ...sections.flatMap((section) => positions(section.boundary)),
      ...markers.map((marker) => [
        marker.position.latitude,
        marker.position.longitude,
      ] as [number, number]),
    ];
    if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 18 });
    }
  }, [boundaries, fitRequest, latitude, longitude, map, markers, sectionDraft, sections]);

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
      if (markerPlacement && !drawRequest) {
        onMarkerPositionSelected({
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        });
        return;
      }
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
                key={`farm-${geometryKey}-${index}-${drawRequest ? "drawing" : markerPlacement ? "placing" : "idle"}`}
                positions={positions(boundary)}
                interactive={!drawRequest && !markerPlacement}
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
            {sections.map((section, index) => editingSectionIndex === index ? null : (
              <Polygon
                key={`${geometryKey}-${section.name}-${index}-${drawRequest ? "drawing" : markerPlacement ? "placing" : "idle"}`}
                positions={positions(section.boundary)}
                interactive={!drawRequest && !markerPlacement}
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
        <LayersControl.Overlay checked name="Custom markers">
          <FeatureGroup>
            {markers.map((marker, index) => editingMarkerIndex === index ? null : (
              <Marker
                key={marker.id}
                position={[marker.position.latitude, marker.position.longitude]}
                icon={customMarkerIcon(marker.category, marker.color, marker.image_data_url)}
                draggable={!drawRequest && !markerPlacement}
                eventHandlers={{
                  dragend(event) {
                    const point = event.target.getLatLng();
                    onMarkerChange(index, {
                      latitude: point.lat,
                      longitude: point.lng,
                    });
                  },
                }}
              >
                <Tooltip>{marker.name}</Tooltip>
                <Popup minWidth={220}>
                  <div className="custom-marker-popup">
                    <span>{marker.category}</span>
                    <strong>{marker.name}</strong>
                    {marker.image_data_url && <img className="custom-marker-popup-image" src={marker.image_data_url} alt="" />}
                    {marker.notes && <p>{marker.notes}</p>}
                    <button
                      className="marker-popup-edit"
                      type="button"
                      aria-label={`Edit ${marker.name}`}
                      title="Edit marker"
                      onClick={() => onMarkerEdit(index)}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </FeatureGroup>
        </LayersControl.Overlay>
      </LayersControl>
      {markerDraftPosition && (
        <MarkerDraftForm
          position={markerDraftPosition}
          name={markerName}
          category={markerCategory}
          notes={markerNotes}
          color={markerColor}
          imageDataUrl={markerImageDataUrl}
          editing={editingMarkerIndex !== null}
          saving={saving}
          onNameChange={onMarkerNameChange}
          onCategoryChange={onMarkerCategoryChange}
          onNotesChange={onMarkerNotesChange}
          onColorChange={onMarkerColorChange}
          onImageSelected={onMarkerImageSelected}
          onImageRemove={onMarkerImageRemove}
          onPositionChange={onMarkerDraftPositionChange}
          onCancel={onMarkerDraftCancel}
          onSave={onMarkerSave}
        />
      )}
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
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [markers, setMarkers] = useState<FarmMarker[]>([]);
  const [markerName, setMarkerName] = useState("");
  const [markerCategory, setMarkerCategory] = useState("Water");
  const [markerNotes, setMarkerNotes] = useState("");
  const [markerColor, setMarkerColor] = useState("#4f7b52");
  const [markerImageDataUrl, setMarkerImageDataUrl] = useState<string | null>(null);
  const [editingMarkerIndex, setEditingMarkerIndex] = useState<number | null>(null);
  const [markerPlacement, setMarkerPlacement] = useState(false);
  const [markerDraftPosition, setMarkerDraftPosition] = useState<Coordinate | null>(null);
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
    setMarkerPlacement(false);
    setMarkerDraftPosition(null);
    setEditingMarkerIndex(null);
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
    const nextSection = {
      name: sectionName.trim(),
      activity: sectionActivity.trim(),
      crop: sectionCrop.trim() || null,
      boundary: sectionDraft,
    };
    const nextSections =
      editingSectionIndex === null
        ? [...sections, nextSection]
        : sections.map((section, index) =>
            index === editingSectionIndex ? nextSection : section,
          );
    const payload = {
      name: projectName.trim(),
      center_latitude: latitude,
      center_longitude: longitude,
      boundaries,
      sections: nextSections,
      markers,
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
      setEditingSectionIndex(null);
      setMessage(
        `Section ${editingSectionIndex === null ? "added" : "updated"} and ${saved.name} saved.`,
      );
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
      markers,
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
    setMarkers(project.markers ?? []);
    setSectionDraft([]);
    setEditingSectionIndex(null);
    setMarkerPlacement(false);
    setMarkerDraftPosition(null);
    setEditingMarkerIndex(null);
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
    setMarkers([]);
    setSectionDraft([]);
    setEditingSectionIndex(null);
    setMarkerPlacement(false);
    setMarkerDraftPosition(null);
    setEditingMarkerIndex(null);
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

  const editSection = (index: number) => {
    const section = sections[index];
    if (!section) return;
    setEditingSectionIndex(index);
    setSectionDraft(section.boundary);
    setSectionName(section.name);
    setSectionActivity(section.activity);
    setSectionCrop(section.crop ?? "");
    setMessage(`Editing ${section.name}. Update its information or redraw its shape.`);
  };

  const removeSection = (index: number) => {
    const section = sections[index];
    if (!section) return;
    setSections((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (editingSectionIndex === index) {
      setEditingSectionIndex(null);
      setSectionDraft([]);
      setSectionName("");
      setSectionActivity("");
      setSectionCrop("");
    } else if (editingSectionIndex !== null && index < editingSectionIndex) {
      setEditingSectionIndex(editingSectionIndex - 1);
    }
    setMessage(`${section.name} removed. Choose Save changes to persist this update.`);
  };

  const placeMarker = () => {
    if (!projectName.trim() || boundaries.length === 0) {
      setMessage("Enter a farm name and draw a farm parcel before adding markers.");
      return;
    }
    if (sections.some((section) => !sectionIsInsideFarm(section.boundary, boundaries))) {
      setMessage("Move every section fully inside one farm parcel before adding a marker.");
      return;
    }
    setMarkerName("");
    setMarkerCategory("Water");
    setMarkerNotes("");
    setMarkerColor("#4f7b52");
    setMarkerImageDataUrl(null);
    setEditingMarkerIndex(null);
    setMarkerDraftPosition(null);
    setDrawRequest(null);
    setLocationMode(false);
    setMarkerPlacement(true);
    setMessage("Tap the map where you want to add the marker.");
  };

  const selectMarkerPosition = (position: Coordinate) => {
    setMarkerPlacement(false);
    setMarkerDraftPosition(position);
    setMessage("Enter the marker details in the map popup, then choose Save marker.");
  };

  const cancelMarkerDraft = () => {
    setMarkerDraftPosition(null);
    setEditingMarkerIndex(null);
    setMarkerName("");
    setMarkerNotes("");
    setMarkerImageDataUrl(null);
    setMessage("Marker cancelled.");
  };

  const editMarker = (index: number) => {
    const marker = markers[index];
    if (!marker) return;
    setMarkerPlacement(false);
    setEditingMarkerIndex(index);
    setMarkerDraftPosition(marker.position);
    setMarkerName(marker.name);
    setMarkerCategory(marker.category);
    setMarkerNotes(marker.notes ?? "");
    setMarkerColor(marker.color ?? "#4f7b52");
    setMarkerImageDataUrl(marker.image_data_url ?? null);
    setMessage(`Editing ${marker.name}. Update the popup and choose Save marker.`);
  };

  const selectMarkerImage = (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setMessage("Choose a PNG, JPEG, WebP, or GIF marker image.");
      return;
    }
    if (file.size > 1_000_000) {
      setMessage("Marker images must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setMarkerImageDataUrl(reader.result);
    });
    reader.addEventListener("error", () => setMessage("The marker image could not be read."));
    reader.readAsDataURL(file);
  };

  const saveMarker = async () => {
    if (saving || !markerDraftPosition || !markerName.trim()) return;
    try {
      if (sections.some((section) => !sectionIsInsideFarm(section.boundary, boundaries))) {
        setMessage("Every section must remain fully inside one farm parcel before adding a marker.");
        return;
      }
      const marker: FarmMarker = {
        id:
          editingMarkerIndex === null
            ? createMarkerId()
            : markers[editingMarkerIndex]?.id ?? createMarkerId(),
        name: markerName.trim(),
        category: markerCategory,
        notes: markerNotes.trim() || null,
        color: markerColor,
        image_data_url: markerImageDataUrl,
        position: markerDraftPosition,
      };
      const nextMarkers =
        editingMarkerIndex === null
          ? [...markers, marker]
          : markers.map((current, index) =>
              index === editingMarkerIndex ? marker : current,
            );
      const payload = {
        name: projectName.trim(),
        center_latitude: latitude,
        center_longitude: longitude,
        boundaries,
        sections,
        markers: nextMarkers,
      };
      setSaving(true);
      const accessToken = await getAccessToken();
      const saved = activeProjectId
        ? await updateProject(activeProjectId, payload, accessToken)
        : await createProject(payload, accessToken);
      setActiveProjectId(saved.id);
      setMarkers(saved.markers ?? []);
      setProjects((current) => {
        const remaining = current.filter((project) => project.id !== saved.id);
        return [saved, ...remaining];
      });
      setMarkerName("");
      setMarkerNotes("");
      setMarkerImageDataUrl(null);
      setMarkerDraftPosition(null);
      setEditingMarkerIndex(null);
      setMessage(
        `${marker.name} ${editingMarkerIndex === null ? "added" : "updated"} and ${saved.name} saved.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The marker could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const updateMarkerPosition = useCallback((index: number, position: Coordinate) => {
    setMarkers((current) =>
      current.map((marker, markerIndex) =>
        markerIndex === index ? { ...marker, position } : marker,
      ),
    );
    setMessage("Marker moved. Choose Save changes to persist its new position.");
  }, []);

  const removeMarker = (index: number) => {
    const marker = markers[index];
    if (!marker) return;
    setMarkers((current) => current.filter((_, markerIndex) => markerIndex !== index));
    if (editingMarkerIndex === index) {
      cancelMarkerDraft();
    } else if (editingMarkerIndex !== null && index < editingMarkerIndex) {
      setEditingMarkerIndex(editingMarkerIndex - 1);
    }
    setMessage(`${marker.name} removed. Choose Save changes to persist this update.`);
  };

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
                editingSectionIndex={editingSectionIndex}
                markers={markers}
                markerDraftPosition={markerDraftPosition}
                markerName={markerName}
                markerCategory={markerCategory}
                markerNotes={markerNotes}
                markerColor={markerColor}
                markerImageDataUrl={markerImageDataUrl}
                editingMarkerIndex={editingMarkerIndex}
                saving={saving}
                projectName={projectName}
                fitRequest={fitRequest}
                centerFocusRequest={centerFocusRequest}
                parcelFocusRequest={parcelFocusRequest}
                locationMode={locationMode}
                markerPlacement={markerPlacement}
                drawRequest={drawRequest}
                cancelRequest={cancelRequest}
                resetEditRequest={resetEditRequest}
                geometryKey={activeProjectId ?? "new"}
                onCenterChange={setCenter}
                onMarkerPositionSelected={selectMarkerPosition}
                onMarkerChange={updateMarkerPosition}
                onMarkerNameChange={setMarkerName}
                onMarkerCategoryChange={setMarkerCategory}
                onMarkerNotesChange={setMarkerNotes}
                onMarkerColorChange={setMarkerColor}
                onMarkerImageSelected={selectMarkerImage}
                onMarkerImageRemove={() => setMarkerImageDataUrl(null)}
                onMarkerDraftPositionChange={setMarkerDraftPosition}
                onMarkerDraftCancel={cancelMarkerDraft}
                onMarkerSave={() => void saveMarker()}
                onMarkerEdit={editMarker}
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
                  setMarkerPlacement(false);
                  cancelMarkerDraft();
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
              <button className={markerPlacement ? "active" : ""} type="button" onClick={placeMarker} disabled={boundaries.length === 0 || saving}>
                <MapPin size={16} /> Add marker
              </button>
              {drawRequest && (
                <button type="button" onClick={() => setCancelRequest((request) => request + 1)}>
                  <X size={16} /> Cancel drawing
                </button>
              )}
              {(markerPlacement || markerDraftPosition) && (
                <button
                  type="button"
                  onClick={() => {
                    setMarkerPlacement(false);
                    cancelMarkerDraft();
                  }}
                >
                  <X size={16} /> Cancel marker
                </button>
              )}
              <button type="button" onClick={() => setFitRequest((request) => request + 1)}>
                <Focus size={16} /> View all
              </button>
            </div>
            <div
              className="map-help"
              tabIndex={0}
              aria-label="Map drawing instructions"
            >
              <Info size={16} />
              <span>Finish a shape by tapping its first point or pressing Enter. Use the edit control at top left to move vertices.</span>
            </div>
          </div>
          <section className="project-builder panel">
            <div className="panel-heading">
              <div><p className="eyebrow">{activeProjectId ? "Editing saved project" : "New project"}</p><h2>Farm details</h2></div>
              <Save size={24} />
            </div>
            <div className="project-form">
              <h3>Farm information</h3>
              <label>Farm name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Mwangaza Farm" /></label>
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
                <h3>{editingSectionIndex === null ? "Add a farm section" : "Edit farm section"}</h3>
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
                  {editingSectionIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSectionIndex(null);
                        setSectionDraft([]);
                        setSectionName("");
                        setSectionActivity("");
                        setSectionCrop("");
                      }}
                    >
                      Cancel edit
                    </button>
                  )}
                  {sectionDraft.length >= 3 && <button type="button" onClick={() => setSectionDraft([])}>Redraw</button>}
                  <button type="button" onClick={() => void addSection()} disabled={sectionDraft.length < 3 || saving}>
                    {saving ? "Saving..." : editingSectionIndex === null ? "Add section" : "Save section"}
                  </button>
                </div>
              </div>
              {markers.length > 0 && (
                <div className="marker-editor">
                  <h3>Map markers</h3>
                  <div className="marker-list">
                    {markers.map((marker, index) => (
                      <article key={marker.id}>
                        {marker.image_data_url ? (
                          <img className="marker-list-image" src={marker.image_data_url} alt="" />
                        ) : (
                          <span className="marker-list-symbol" style={{ background: marker.color }}>
                            {markerSymbols[marker.category] ?? markerSymbols.Other}
                          </span>
                        )}
                        <div>
                          <strong>{marker.name}</strong>
                          <small>{marker.category}{marker.notes ? ` · ${marker.notes}` : ""}</small>
                        </div>
                        <button
                          className="marker-edit-button"
                          type="button"
                          aria-label={`Edit ${marker.name}`}
                          onClick={() => editMarker(index)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${marker.name}`}
                          onClick={() => removeMarker(index)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              )}
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
                <span>
                  {project.boundaries.length} parcels · {project.sections.length} sections · {(project.markers ?? []).length} markers
                </span>
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
                  <button className="section-edit-button" type="button" aria-label={`Edit ${section.name}`} onClick={() => editSection(index)}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" aria-label={`Remove ${section.name}`} onClick={() => removeSection(index)}>
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
