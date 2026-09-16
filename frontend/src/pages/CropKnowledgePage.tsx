import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { createCropRule, getCropRules } from "../api";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { CropRule, CropRuleInput } from "../types";

export default function CropKnowledgePage() {
  const [rules, setRules] = useState<CropRule[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getCropRules()
      .then(setRules)
      .catch(() => setMessage("Crop rules could not be loaded."));
  }, []);

  const filteredRules = rules.filter((rule) =>
    rule.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const numeric = (name: string) => Number(form.get(name));
    const payload: CropRuleInput = {
      name: String(form.get("name") ?? ""),
      temperature_min_c: numeric("temperature_min_c"),
      temperature_max_c: numeric("temperature_max_c"),
      monthly_rainfall_min_mm: numeric("monthly_rainfall_min_mm"),
      monthly_rainfall_max_mm: numeric("monthly_rainfall_max_mm"),
      elevation_min_m: numeric("elevation_min_m"),
      elevation_max_m: numeric("elevation_max_m"),
      duration_min_days: numeric("duration_min_days"),
      duration_max_days: numeric("duration_max_days"),
      planting_guidance: String(form.get("planting_guidance") ?? ""),
      sensitivities: String(form.get("sensitivities") ?? "").split("\n").map((item) => item.trim()).filter(Boolean),
      source: String(form.get("source") ?? ""),
    };
    try {
      const saved = await createCropRule(payload);
      setRules((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`${saved.name} is now available in the farm analyzer.`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The crop rule could not be saved.");
    }
  };

  return (
    <main>
      <SiteHeader />
      <section className="page-hero">
        <p className="kicker">Transparent crop knowledge</p>
        <h1>See what drives every crop recommendation.</h1>
        <p>Review supported crops, their assumptions and sources, or add a sourced rule for another crop.</p>
      </section>
      <section className="page-workspace">
        <section className="crop-catalog panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Crop knowledge</p><h2>Available crop rules</h2></div>
            <BookOpen size={24} />
          </div>
          <label className="catalog-search">
            Search crops
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search maize, pineapple, coffee..." />
          </label>
          <div className="crop-rule-grid">
            {filteredRules.map((rule) => (
              <article key={rule.key}>
                <div><strong>{rule.name}</strong>{rule.custom && <span className="custom-badge">Custom</span>}</div>
                <p>{rule.temperature_min_c}-{rule.temperature_max_c} C · {rule.monthly_rainfall_min_mm}-{rule.monthly_rainfall_max_mm} mm/month</p>
                <span>{rule.elevation_min_m}-{rule.elevation_max_m} m · {rule.duration_min_days}-{rule.duration_max_days} days</span>
                <small>{rule.source}</small>
              </article>
            ))}
          </div>
          <details className="add-crop-rule">
            <summary>Add another crop rule</summary>
            <form onSubmit={submit}>
              <label>Crop name<input name="name" placeholder="e.g. passion fruit" required /></label>
              <label>Source<input name="source" placeholder="Publication, extension guide, or expert reference" required /></label>
              <div className="rule-range">
                <label>Min temperature (C)<input name="temperature_min_c" type="number" step="0.1" required /></label>
                <label>Max temperature (C)<input name="temperature_max_c" type="number" step="0.1" required /></label>
                <label>Min rainfall (mm/month)<input name="monthly_rainfall_min_mm" type="number" step="0.1" required /></label>
                <label>Max rainfall (mm/month)<input name="monthly_rainfall_max_mm" type="number" step="0.1" required /></label>
                <label>Min elevation (m)<input name="elevation_min_m" type="number" step="1" required /></label>
                <label>Max elevation (m)<input name="elevation_max_m" type="number" step="1" required /></label>
                <label>Min duration (days)<input name="duration_min_days" type="number" required /></label>
                <label>Max duration (days)<input name="duration_max_days" type="number" required /></label>
              </div>
              <label>Planting guidance<textarea name="planting_guidance" rows={3} required /></label>
              <label>Main risks, one per line<textarea name="sensitivities" rows={3} required /></label>
              <button className="primary-button" type="submit">Add crop rule</button>
              {message && <p className="form-message">{message}</p>}
            </form>
          </details>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

