import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Layers3, MapPin, Mountain, Sprout } from "lucide-react";
import {
  MapContainer,
  Marker,
  LayersControl,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  WMSTileLayer,
} from "react-leaflet";
import { getLandIntelligence } from "../api";
import { CoordinateForm } from "../components/CoordinateForm";
import { initialCoordinates } from "../coordinates";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { LandIntelligence } from "../types";

interface SoilLayer {
  key: string;
  name: string;
  description: string;
  unit: string;
  mapFile: string;
  layer: string;
  gradientLow: string;
  gradientMiddle: string;
  gradientHigh: string;
  gradient: string;
  gradientSummary: string;
}

const soilLayers: SoilLayer[] = [
  { key: "phh2o", name: "Soil pH", description: "Acidity or alkalinity in the top 5 cm", unit: "pH x 10", mapFile: "phh2o", layer: "phh2o_0-5cm_mean", gradientLow: "More acidic", gradientMiddle: "Mid-range pH", gradientHigh: "More alkaline", gradient: "linear-gradient(90deg, #f4f87c, #b2e382, #80cd75, #2a9945, #5ddce5)", gradientSummary: "Yellow moves through green to cyan as the modelled pH increases." },
  { key: "clay", name: "Clay content", description: "Modelled clay fraction in the top 5 cm", unit: "g/kg", mapFile: "clay", layer: "clay_0-5cm_mean", gradientLow: "Less clay", gradientMiddle: "Moderate clay", gradientHigh: "More clay", gradient: "linear-gradient(90deg, #f6e6d5, #d8a775, #cfa881, #b99471, #a28261)", gradientSummary: "Pale earth tones deepen to brown as modelled clay content increases." },
  { key: "sand", name: "Sand content", description: "Modelled sand fraction in the top 5 cm", unit: "g/kg", mapFile: "sand", layer: "sand_0-5cm_mean", gradientLow: "Less sand", gradientMiddle: "Moderate sand", gradientHigh: "More sand", gradient: "linear-gradient(90deg, #f6e6d5, #d8a775, #cfa881, #b99471, #a28261)", gradientSummary: "Pale sand tones deepen to brown as modelled sand content increases." },
  { key: "soc", name: "Organic carbon", description: "Modelled soil organic carbon in the top 5 cm", unit: "dg/kg", mapFile: "soc", layer: "soc_0-5cm_mean", gradientLow: "Lower carbon", gradientMiddle: "Moderate carbon", gradientHigh: "Higher carbon", gradient: "linear-gradient(90deg, #fcfafa, #e6dedb, #b69d95, #b59b94, #a07e75)", gradientSummary: "Off-white changes through taupe to dark earth as modelled organic carbon increases." },
  { key: "nitrogen", name: "Total nitrogen", description: "Modelled total nitrogen in the top 5 cm", unit: "cg/kg", mapFile: "nitrogen", layer: "nitrogen_0-5cm_mean", gradientLow: "Lower nitrogen", gradientMiddle: "Moderate nitrogen", gradientHigh: "Higher nitrogen", gradient: "linear-gradient(90deg, #f9fcf8, #cfedc9, #aadba9, #70b786, #53a773)", gradientSummary: "Very pale green deepens to leaf green as modelled nitrogen increases." },
  { key: "cec", name: "Cation exchange capacity", description: "Modelled nutrient-holding capacity in the top 5 cm", unit: "mmol(c)/kg", mapFile: "cec", layer: "cec_0-5cm_mean", gradientLow: "Lower capacity", gradientMiddle: "Moderate capacity", gradientHigh: "Higher capacity", gradient: "linear-gradient(90deg, #f2fafc, #b9d1e6, #b3bbda, #af8ec4, #db63d6)", gradientSummary: "Pale blue changes through violet to magenta as modelled nutrient-holding capacity increases." },
  { key: "bdod", name: "Bulk density", description: "Modelled density of the fine-earth fraction in the top 5 cm", unit: "cg/cm3", mapFile: "bdod", layer: "bdod_0-5cm_mean", gradientLow: "Lower density", gradientMiddle: "Moderate density", gradientHigh: "Higher density", gradient: "linear-gradient(90deg, #f4faef, #bfe6c1, #a9ded7, #82c1db, #5999c7)", gradientSummary: "Pale green changes through teal to blue as modelled bulk density increases." },
];

const markerIcon = L.divIcon({
  className: "farm-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function LandMapController({
  latitude,
  longitude,
  onSelect,
}: {
  latitude: number;
  longitude: number;
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
    <Marker position={[latitude, longitude]} icon={markerIcon}>
      <Popup>
        <strong>Selected soil location</strong>
        <br />
        {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </Popup>
    </Marker>
  );
}

export default function LandPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [selectedLayerKey, setSelectedLayerKey] = useState("phh2o");
  const [data, setData] = useState<LandIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSequence = useRef(0);
  const selectedLayer = useMemo(
    () => soilLayers.find((layer) => layer.key === selectedLayerKey) ?? soilLayers[0],
    [selectedLayerKey],
  );

  useEffect(() => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError(null);
    setData(null);
    void getLandIntelligence(latitude, longitude)
      .then((result) => {
        if (requestSequence.current === requestId) setData(result);
      })
      .catch((requestError) => {
        if (requestSequence.current === requestId) {
          setError(requestError instanceof Error ? requestError.message : "Land intelligence could not be loaded.");
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

  const wmsUrl = `https://maps.isric.org/mapserv?map=/map/${selectedLayer.mapFile}.map`;

  useEffect(() => {
    setTileError(null);
  }, [selectedLayer.layer]);

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Soil and terrain</p>
        <h1>Explore modelled soil patterns around the farm.</h1>
        <p>Click the map to move the farm point and reload its terrain and soil guidance. Map colors are SoilGrids estimates, not laboratory results.</p>
      </section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={selectLocation} />
        <div className="land-map-layout">
          <section className="panel land-map-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Interactive soil map</p><h2>{selectedLayer.name}</h2></div>
              <Layers3 size={24} />
            </div>
            <label className="soil-layer-picker">
              Soil profile layer
              <select value={selectedLayerKey} onChange={(event) => setSelectedLayerKey(event.target.value)}>
                {soilLayers.map((layer) => <option key={layer.key} value={layer.key}>{layer.name}</option>)}
              </select>
            </label>
            <p className="panel-intro">{selectedLayer.description}. Units shown by the provider: {selectedLayer.unit}.</p>
            <MapContainer center={[latitude, longitude]} zoom={11} className="land-profile-map">
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
              </LayersControl>
              <WMSTileLayer
                key={selectedLayer.layer}
                url={wmsUrl}
                layers={selectedLayer.layer}
                styles="default"
                format="image/png"
                transparent
                opacity={0.62}
                version="1.3.0"
                zIndex={250}
                eventHandlers={{
                  tileerror: () => {
                    setTileError("The SoilGrids overlay could not be loaded. The base map remains available; try the layer again shortly.");
                  },
                }}
                attribution='SoilGrids 250 m &copy; <a href="https://www.isric.org/explore/soilgrids">ISRIC - World Soil Information</a>'
              />
              <LandMapController latitude={latitude} longitude={longitude} onSelect={selectLocation} />
            </MapContainer>
            <div className="soil-map-footer">
              <div>
                <MapPin size={16} />
                <span>{latitude.toFixed(6)}, {longitude.toFixed(6)} {loading && "· loading location information..."}</span>
              </div>
            </div>
            <figure className="soil-color-legend">
              <figcaption>
                <strong>{selectedLayer.name} color guide</strong>
                <span>{selectedLayer.gradientSummary}</span>
              </figcaption>
              <div className="soil-gradient-scale" role="img" aria-label={`${selectedLayer.gradientLow} to ${selectedLayer.gradientHigh}`}>
                <div className="soil-gradient-bar" style={{ background: selectedLayer.gradient }} />
                <div className="soil-gradient-labels">
                  <span><strong>{selectedLayer.gradientLow}</strong><small>Lower value</small></span>
                  <span><strong>{selectedLayer.gradientMiddle}</strong><small>Middle range</small></span>
                  <span><strong>{selectedLayer.gradientHigh}</strong><small>Higher value</small></span>
                </div>
                <p>SoilGrids units: {selectedLayer.unit}. Use the colors to compare broad patterns, not as an exact reading for the selected point.</p>
              </div>
            </figure>
            {tileError && <div className="state-message error soil-tile-error">{tileError}</div>}
            <p className="responsible-note">This layer shows a 250 m modelled pattern at 0-5 cm depth. It can identify variation worth investigating, but it cannot diagnose the selected farm point or replace sampling.</p>
          </section>
          <aside className="soil-layer-list panel">
            <p className="eyebrow">Available map profiles</p>
            <h2>Compare soil properties</h2>
            {soilLayers.map((layer) => (
              <button
                type="button"
                key={layer.key}
                className={layer.key === selectedLayerKey ? "active" : ""}
                onClick={() => setSelectedLayerKey(layer.key)}
              >
                <strong>{layer.name}</strong>
                <span>{layer.description}</span>
              </button>
            ))}
          </aside>
        </div>
        {error && <div className="state-message error">{error}</div>}
        {data && (
          <div className="detail-grid land-detail-grid">
            <section className="panel">
              <Sprout />
              <p className="eyebrow">Selected-point soil guidance</p>
              <h2>{data.soil.status}</h2>
              <p>{data.soil.interpretation}</p>
              {Object.keys(data.soil.properties).length > 0 && (
                <>
                  <h3>Modelled topsoil values</h3>
                  <dl className="soil-property-grid">
                    {Object.entries(data.soil.properties).map(([property, value]) => (
                      <div key={property}>
                        <dt>{property}</dt>
                        <dd>{value ?? "Unavailable"}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <h3>What to test</h3>
              <ul>{data.soil.soil_test_checklist.map((item) => <li key={item}>{item}</li>)}</ul>
              {data.soil.source && <small>Source: {data.soil.source}. {data.soil.limitations.join(" ")}</small>}
            </section>
            <section className="panel">
              <Mountain />
              <p className="eyebrow">Terrain at selected point</p>
              <h2>{data.terrain.elevation_m === null ? "Elevation unavailable" : `${Math.round(data.terrain.elevation_m)} m elevation`}</h2>
              <p>{data.terrain.terrain_class}</p>
              <h3>Drainage</h3>
              <p>{data.terrain.drainage_interpretation}</p>
              <h3>Erosion</h3>
              <p>{data.terrain.erosion_risk}</p>
              <small>{data.terrain.limitations.join(" ")}</small>
            </section>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
