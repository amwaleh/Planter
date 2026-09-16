import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { askFarmAssistant } from "../api";
import { CoordinateForm } from "../components/CoordinateForm";
import { initialCoordinates } from "../coordinates";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { AssistantResponse } from "../types";

export default function AssistantPage() {
  const initial = initialCoordinates();
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [crop, setCrop] = useState("maize");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      setResponse(await askFarmAssistant(latitude, longitude, crop, question));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The assistant could not answer.");
    }
  };
  return (
    <main>
      <SiteHeader />
      <section className="page-hero"><p className="kicker">Grounded farm assistant</p><h1>Ask questions about the current farm evidence.</h1><p>Answers are limited to structured weather, climate, crop, water, and source information.</p></section>
      <section className="page-workspace">
        <CoordinateForm latitude={latitude} longitude={longitude} onSubmit={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
        <section className="assistant-panel panel">
          <MessageCircle size={28} />
          <form onSubmit={submit}>
            <label>Crop context<input value={crop} onChange={(event) => setCrop(event.target.value)} /></label>
            <label>Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} placeholder="Can I grow maize here? Should I irrigate? Why is confidence medium?" required /></label>
            <button className="primary-button" type="submit">Ask Planter</button>
          </form>
          {error && <p className="form-message error">{error}</p>}
          {response && <article className="assistant-answer"><p>{response.answer}</p>{response.citations.length > 0 && <p><strong>Sources:</strong> {response.citations.join(", ")}</p>}<small>{response.limitations.join(" ")}</small></article>}
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
