import { useEffect, useState } from "react";
import { getLivestockReport } from "../api";
import { CoordinateForm } from "../components/CoordinateForm";
import { initialCoordinates } from "../coordinates";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { LivestockReport } from "../types";

export default function LivestockPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [report, setReport] = useState<LivestockReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getLivestockReport(latitude, longitude).then(setReport).catch((requestError) =>
      setError(requestError instanceof Error ? requestError.message : "Livestock guidance could not be loaded."),
    );
  }, [latitude, longitude]);
  return (
    <main>
      <SiteHeader />
      <section className="page-hero"><p className="kicker">Livestock advisor</p><h1>Compare livestock options with the evidence available.</h1><p>Climate is only a first filter. Feed, breed, water, pasture, veterinary access, and local production systems still require verification.</p></section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
        {error && <div className="state-message error">{error}</div>}
        {report && <><p className="panel-intro">{report.evidence_note}</p><div className="livestock-grid">{report.assessments.map((item) => <article className="panel" key={item.livestock}><p className="eyebrow">{item.confidence} confidence</p><h2>{item.livestock}</h2><span className="fit-category">{item.suitability}</span><h3>Evidence</h3><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>Constraints</h3><ul>{item.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></article>)}</div></>}
      </section>
      <SiteFooter />
    </main>
  );
}
