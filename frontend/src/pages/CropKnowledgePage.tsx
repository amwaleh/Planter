import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { createCropRule, getCropCatalog, getCropRules } from "../api";
import { PlantImage } from "../components/PlantImage";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import type { CropCatalogItem, CropRule, CropRuleInput } from "../types";

export default function CropKnowledgePage() {
  const [rules, setRules] = useState<CropRule[]>([]);
  const [catalog, setCatalog] = useState<CropCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void getCropRules()
      .then(setRules)
      .catch(() => setMessage("Crop rules could not be loaded."));
    void getCropCatalog()
      .then(setCatalog)
      .catch(() => setMessage("The East African crop catalog could not be loaded."));
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCatalog = catalog.filter(
    (item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery)),
  );
  const rulesByName = new Map(rules.map((rule) => [rule.name.toLowerCase(), rule]));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const numeric = (name: string) => Number(form.get(name));
    const payload: CropRuleInput = {
      name: String(form.get("name") ?? ""),
      category: form.get("category") as CropRuleInput["category"],
      wikipedia_title: String(form.get("wikipedia_title") ?? "") || null,
      image_url: String(form.get("image_url") ?? "") || null,
      image_source_page_url: String(form.get("image_source_page_url") ?? "") || null,
      image_creator: String(form.get("image_creator") ?? "") || null,
      image_license: String(form.get("image_license") ?? "") || null,
      image_license_url: String(form.get("image_license_url") ?? "") || null,
      image_alt_text: String(form.get("image_alt_text") ?? "") || null,
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
      setCatalog((current) => {
        const catalogItem: CropCatalogItem = {
          name: saved.name,
          category: saved.category,
          aliases: [],
          region: "User supplied",
          rule_status: "Validated prototype rule",
          wikipedia_title: saved.wikipedia_title || saved.name,
          source_notes: [saved.source],
          image: saved.image_url && saved.image_source_page_url ? {
            crop_name: saved.name,
            image_url: saved.image_url,
            source_page_url: saved.image_source_page_url,
            creator: saved.image_creator || "User supplied",
            license: saved.image_license || "User supplied",
            license_url: saved.image_license_url,
            alt_text: saved.image_alt_text || `${saved.name} plant or produce`,
            retrieved_at: new Date().toISOString(),
          } : null,
        };
        const existingIndex = current.findIndex(
          (item) => item.name.toLowerCase() === saved.name.toLowerCase(),
        );
        const updated = [...current];
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...catalogItem,
            source_notes: [saved.source, ...updated[existingIndex].source_notes],
          };
        } else {
          updated.push(catalogItem);
        }
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
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
        <p>Explore a broad, non-exhaustive East African catalog. Suitability is enabled only for crops with validated prototype rules.</p>
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
          <div className="crop-rule-grid crop-catalog-grid">
            {filteredCatalog.map((item) => {
              const rule = rulesByName.get(item.name.toLowerCase());
              return (
              <article key={`${item.category}-${item.name}`}>
                <PlantImage name={item.name} title={item.wikipedia_title} alt={`${item.name} plant`} image={item.image} />
                <div><strong>{item.name}</strong><span className={rule ? "custom-badge" : "pending-badge"}>{rule ? "Scorable" : "Rule pending"}</span></div>
                <p>{item.category} · {item.region}</p>
                {rule ? (
                  <>
                    <span>{rule.temperature_min_c}-{rule.temperature_max_c} C · {rule.monthly_rainfall_min_mm}-{rule.monthly_rainfall_max_mm} mm/month</span>
                    <small>{rule.source}</small>
                  </>
                ) : (
                  <span>Catalogued for discovery; suitability is disabled until agronomic ranges and provenance are validated.</span>
                )}
                <details className="catalog-sources">
                  <summary>Catalog sources</summary>
                  <ul>{item.source_notes.map((source) => <li key={source}>{source}</li>)}</ul>
                </details>
              </article>
            )})}
          </div>
          <details className="add-crop-rule">
            <summary>Add another crop rule</summary>
            <form onSubmit={submit}>
              <label>Crop name<input name="name" placeholder="e.g. passion fruit" required /></label>
              <label>Category<select name="category" defaultValue="fruits"><option value="fruits">Fruit</option><option value="vegetables">Vegetable</option><option value="other">Other crop</option></select></label>
              <label>Wikipedia plant page title<input name="wikipedia_title" placeholder="e.g. Passion fruit" required /></label>
              <label>Source<input name="source" placeholder="Publication, extension guide, or expert reference" required /></label>
              <details className="custom-image-fields">
                <summary>Use a specific licensed image (optional)</summary>
                <p>Complete all fields below together, or leave all blank to use the Wikimedia lookup.</p>
                <label>Image URL<input name="image_url" type="url" /></label>
                <label>Image source page<input name="image_source_page_url" type="url" /></label>
                <label>Creator<input name="image_creator" /></label>
                <label>License<input name="image_license" placeholder="e.g. CC BY-SA 4.0" /></label>
                <label>License URL<input name="image_license_url" type="url" /></label>
                <label>Image description<input name="image_alt_text" placeholder="Accessible description of the plant or produce" /></label>
              </details>
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
