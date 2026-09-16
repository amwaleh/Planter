import { useEffect, useState } from "react";
import { Mountain, Sprout } from "lucide-react";
import { getLandIntelligence } from "../api";
import { CoordinateForm } from "../components/CoordinateForm";
import { initialCoordinates } from "../coordinates";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { LandIntelligence } from "../types";

export default function LandPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [data, setData] = useState<LandIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getLandIntelligence(latitude, longitude).then(setData).catch((requestError) =>
      setError(requestError instanceof Error ? requestError.message : "Land intelligence could not be loaded."),
    );
  }, [latitude, longitude]);

  return (
    <main>
      <SiteHeader />
      <section className="page-hero"><p className="kicker">Soil and terrain</p><h1>Know what is measured—and what still needs a field check.</h1><p>Planter does not substitute climate or elevation for a laboratory soil test or slope survey.</p></section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
        {error && <div className="state-message error">{error}</div>}
        {data && (
          <div className="detail-grid">
            <section className="panel"><Sprout /><p className="eyebrow">Soil profile</p><h2>{data.soil.status}</h2><p>{data.soil.interpretation}</p><h3>What to test</h3><ul>{data.soil.soil_test_checklist.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section className="panel"><Mountain /><p className="eyebrow">Terrain</p><h2>{data.terrain.elevation_m === null ? "Elevation unavailable" : `${Math.round(data.terrain.elevation_m)} m elevation`}</h2><p>{data.terrain.terrain_class}</p><h3>Drainage</h3><p>{data.terrain.drainage_interpretation}</p><h3>Erosion</h3><p>{data.terrain.erosion_risk}</p><small>{data.terrain.limitations.join(" ")}</small></section>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
