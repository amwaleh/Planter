import { useEffect, useState } from "react";
import L from "leaflet";
import { Droplets, MapPin, Waves } from "lucide-react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
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

export default function WaterPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [data, setData] = useState<WaterIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    void getWaterIntelligence(latitude, longitude)
      .then(setData)
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Water intelligence could not be loaded."),
      );
  }, [latitude, longitude]);

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Water intelligence</p>
        <h1>Understand available water evidence.</h1>
        <p>Rainfall and mapped surface water can guide planning, but they cannot prove groundwater depth, borehole success, or a piped connection.</p>
      </section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
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
            {data.nearest_surface_water && (
              <section className="panel water-map-panel">
                <p className="eyebrow">Surface-water context</p>
                <h2>Farm to nearest mapped feature</h2>
                <MapContainer
                  bounds={[
                    [latitude, longitude],
                    [data.nearest_surface_water.latitude, data.nearest_surface_water.longitude],
                  ]}
                  boundsOptions={{ padding: [40, 40] }}
                  className="water-map"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[latitude, longitude]} icon={farmIcon}><Popup>Selected farm</Popup></Marker>
                  <Marker position={[data.nearest_surface_water.latitude, data.nearest_surface_water.longitude]} icon={waterIcon}>
                    <Popup>{data.nearest_surface_water.name}</Popup>
                  </Marker>
                  <Polyline
                    positions={[
                      [latitude, longitude],
                      [data.nearest_surface_water.latitude, data.nearest_surface_water.longitude],
                    ]}
                    pathOptions={{ color: "#3975a8", dashArray: "7 6" }}
                  />
                </MapContainer>
                <small>Straight-line distance only. This does not establish access, water quality, or reliable supply.</small>
              </section>
            )}
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
