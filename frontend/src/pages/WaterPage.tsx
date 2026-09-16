import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Droplets, LoaderCircle, MapPin, Waves } from "lucide-react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { getWaterIntelligence } from "../api";
import { CoordinateForm } from "../components/CoordinateForm";
import { initialCoordinates } from "../coordinates";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { WaterIntelligence } from "../types";

const farmIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const waterIcon = L.divIcon({
  className: "water-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function WaterMapController({
  latitude,
  longitude,
  nearestSurfaceWater,
  onSelect,
}: {
  latitude: number;
  longitude: number;
  nearestSurfaceWater: WaterIntelligence["nearest_surface_water"];
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return (
    <>
      <Marker position={[latitude, longitude]} icon={farmIcon}>
        <Popup>
          <strong>Selected farm location</strong>
          <br />
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Popup>
      </Marker>
      {nearestSurfaceWater && (
        <>
          <Marker
            position={[nearestSurfaceWater.latitude, nearestSurfaceWater.longitude]}
            icon={waterIcon}
          >
            <Popup>
              <strong>{nearestSurfaceWater.name}</strong>
              <br />
              {nearestSurfaceWater.kind} · {nearestSurfaceWater.distance_km} km away
            </Popup>
          </Marker>
          <Polyline
            positions={[
              [latitude, longitude],
              [nearestSurfaceWater.latitude, nearestSurfaceWater.longitude],
            ]}
            pathOptions={{ color: "#3975a8", dashArray: "7 6" }}
          />
        </>
      )}
    </>
  );
}

export default function WaterPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [data, setData] = useState<WaterIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError(null);
    setData(null);
    void getWaterIntelligence(latitude, longitude)
      .then((result) => {
        if (requestSequence.current === requestId) setData(result);
      })
      .catch((requestError) => {
        if (requestSequence.current === requestId) {
          setError(requestError instanceof Error ? requestError.message : "Water intelligence could not be loaded.");
        }
      })
      .finally(() => {
        if (requestSequence.current === requestId) setLoading(false);
      });
  }, [latitude, longitude]);

  const selectLocation = (nextLatitude: number, nextLongitude: number) => {
    if (
      nextLatitude < -4.9 ||
      nextLatitude > 5 ||
      nextLongitude < 33.5 ||
      nextLongitude > 42.1
    ) {
      setError("Planter currently analyzes locations within Kenya. Select a point inside the supported map area.");
      return;
    }
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
  };

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Water intelligence</p>
        <h1>Understand available water evidence.</h1>
        <p>Rainfall and mapped surface water can guide planning, but they cannot prove groundwater depth, borehole success, or a piped connection.</p>
      </section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={selectLocation} />
        <section className="panel water-map-panel" aria-busy={loading}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Pinpoint farm location</p>
              <h2>Click the map to analyze water evidence</h2>
            </div>
            <MapPin size={24} />
          </div>
          <p className="panel-intro">
            Move the farm pin by clicking inside Kenya. Coordinates and all water evidence update together.
          </p>
          {loading && (
            <div className="water-loading-bar" role="status" aria-live="polite">
              <span />
              <strong>Analyzing rainfall, terrain, and nearby water...</strong>
            </div>
          )}
          <div className="water-map-shell">
            <MapContainer center={[latitude, longitude]} zoom={11} className="water-map">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <WaterMapController
                latitude={latitude}
                longitude={longitude}
                nearestSurfaceWater={data?.nearest_surface_water ?? null}
                onSelect={selectLocation}
              />
            </MapContainer>
            {loading && (
              <div className="water-map-loading" aria-hidden="true">
                <LoaderCircle className="spin" size={30} />
                <span>Loading this location</span>
              </div>
            )}
          </div>
          <div className="water-map-location">
            <MapPin size={16} />
            <span>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
              {loading && " · loading water intelligence..."}
            </span>
          </div>
          <small>
            The line to a mapped water feature is straight-line distance only. It does not establish access, quality, or reliable supply.
          </small>
        </section>
        {error && <div className="state-message error">{error}</div>}
        {data && (
          <div className="detail-grid">
            <section className="panel">
              <Droplets />
              <p className="eyebrow">Agricultural water</p>
              <h2>{data.recent_moisture_classification}</h2>
              <p>{data.recent_rainfall_mm} mm fell during the previous 21 completed days.</p>
              <p>{data.current_year_rainfall_mm} mm fell in completed months this year, compared with {data.expected_rainfall_mm} mm expected from the ten-year pattern.</p>
              <p>{data.forecast_et0_mm === null ? "Forecast evapotranspiration is unavailable." : `${data.forecast_et0_mm} mm reference evapotranspiration is forecast across the available forecast period.`}</p>
              <h3>{data.irrigation_signal}</h3>
              <p>{data.irrigation_explanation}</p>
              <small>{data.soil_moisture_status}</small>
            </section>
            <section className="panel">
              <Waves />
              <p className="eyebrow">Nearest mapped surface water</p>
              {data.nearest_surface_water ? (
                <>
                  <h2>{data.nearest_surface_water.name}</h2>
                  <p>{data.nearest_surface_water.kind} · approximately {data.nearest_surface_water.distance_km} km away</p>
                  <small>Source: {data.nearest_surface_water.source}</small>
                  <small>{data.nearest_surface_water.limitations.join(" ")}</small>
                </>
              ) : <p>{data.surface_water_status}</p>}
            </section>
            <section className="panel">
              <MapPin />
              <p className="eyebrow">Topography and drainage</p>
              <h2>{data.elevation_m === null ? "Elevation unavailable" : `${Math.round(data.elevation_m)} m elevation`}</h2>
              <p>{data.terrain_status}</p>
            </section>
            <section className="panel">
              <MapPin />
              <p className="eyebrow">Groundwater and boreholes</p>
              <h2>Survey required</h2>
              <p>{data.groundwater_status}</p>
            </section>
            <section className="panel">
              <p className="eyebrow">Piped water</p>
              <h2>Connection not confirmed</h2>
              <p>{data.piped_water_status}</p>
            </section>
            <details className="panel water-map-panel">
              <summary><strong>Water sources and limitations</strong></summary>
              <div className="source-table">
                {data.sources.map((source) => (
                  <article key={`${source.provider}-${source.kind}`}>
                    <div><strong>{source.provider}</strong><span>{source.kind}</span></div>
                    <div><strong>{source.confidence} reliability</strong><span>{new Date(source.retrieved_at).toLocaleString()}</span></div>
                    <p>{source.resolution} {source.limitations.join(" ")}</p>
                  </article>
                ))}
              </div>
            </details>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
