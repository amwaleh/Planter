# Planter: Kenya AI Farm Intelligence

## Vision

Planter turns a GPS coordinate, dropped pin, latitude/longitude pair, or Kenyan place name into an explainable farm intelligence report. It should help a farmer decide what can grow at a location, when to plant, what conditions to expect, which risks matter, whether irrigation may be needed, and which local practices or livestock systems may fit.

Kenya is the MVP geography. Provider interfaces, normalized evidence, localization, and geographic configuration must support later expansion across Africa.

## Product principles

1. **Decision support, not a weather dashboard.** Combine weather, historical climate, soil, terrain, water, crop, livestock, and agronomic knowledge.
2. **Evidence before explanation.** Structured providers and explicit rules produce an evidence package; AI explains that evidence but does not manufacture measurements.
3. **No fabricated data.** Missing groundwater, soil, agronomy, or forecast data is shown as unavailable with a reason.
4. **Transparent provenance.** Every signal includes provider, observation type, retrieval time, geographic and temporal resolution where known, confidence, and limitations.
5. **No false precision.** Prefer suitability categories unless a documented scoring formula supports a numeric score.
6. **Farmer-first communication.** Translate technical values into concise, actionable English and Kiswahili without hiding uncertainty.

## MVP user journey

1. Select a real Kenyan location with search, GPS, coordinates, or a map pin.
2. Resolve coordinates into county and administrative context where available.
3. Load current weather, forecast, historical climate, elevation, terrain, and available soil evidence.
4. Ask whether a crop such as onions can grow there.
5. Receive a suitability category, explainable component scores, risks, confidence, planting guidance, and alternatives.
6. Review a 21-day agricultural outlook that distinguishes numerical forecast days from lower-confidence seasonal guidance.
7. Inspect every source, timestamp, resolution, limitation, and transformation.

## Functional scope

### Location

- Current GPS, map pin, coordinate entry, Kenyan place-name search, and Google Maps share-link coordinate extraction.
- Coordinates are canonical.
- Resolve county, sub-county, ward, elevation, slope, and agro-ecological context only when supported by authoritative data.
- Allow users to sketch a farm boundary and internal management sections, name each section, assign an activity or crop, and persist the result as a reusable farm project.
- Treat drawn boundaries as planning geometry, not surveyed or legal cadastral boundaries.

### Weather and climate

- Current temperature, precipitation, humidity, wind, evapotranspiration, soil temperature, and soil moisture when available.
- Multi-year monthly rainfall and temperature patterns.
- Wet/dry season signals, rainfall variability, anomalies, and consecutive dry periods when data supports them.
- A 21-day outlook composed of available numerical forecast, recent conditions, climatology, and soil/water signals.
- Each outlook signal includes confidence and must not imply deterministic certainty beyond the source forecast horizon.

### Soil, terrain, and water

- Soil pH, texture, organic carbon, nitrogen, CEC, bulk density, and water-holding indicators.
- Label gridded/modelled soil values as estimates, never laboratory results.
- Elevation, slope, drainage context, erosion, waterlogging, mechanization, and irrigation implications.
- Separate surface/agricultural water indicators from groundwater evidence.
- Never infer groundwater depth from rainfall, soil moisture, or nearby surface water.

### Crop suitability

- Flows for “Can I grow this?” and “What should I grow?”
- Searchable crop catalog with common-name aliases and conservative spelling correction; unsupported crops must not receive invented suitability rules.
- Let users inspect rule assumptions and add persistent custom crop rules only when required ranges, limitations, and a source are supplied.
- Explicit scoring factors: temperature, rainfall, humidity, soil, elevation, terrain, water need, season length, and authoritative local guidance.
- Return category, component scores, reasons, risks, confidence, planting window, expected harvest window, and alternatives.
- Do not recommend fertilizer dosage without an authoritative source and adequate soil-test evidence.

### Livestock and practices

- Explain climate, heat, pasture, water, terrain, and local production-system fit for relevant livestock categories.
- Provide sourced land preparation, planting, water management, erosion control, rotation, intercropping, harvesting, and post-harvest guidance.
- Do not provide veterinary diagnosis or treatment.

### Conversational assistant

- Answer only from the current farm evidence package and approved agronomic knowledge.
- Cite evidence used in each answer.
- State when the available evidence cannot support an answer.
- Never convert AI fluency into artificial certainty.

## Provider strategy

| Capability | Primary | Secondary / investigation |
|---|---|---|
| Forecast and current weather | Open-Meteo | Kenya Agricultural Observatory Platform |
| Historical climate | Open-Meteo archive | NASA POWER |
| Kenya soil and crop knowledge | KALRO Land Soil Crop Hub | SoilGrids, KENSOTER |
| Water productivity | FAO WaPOR | Kenya hydrogeological/borehole sources |
| Agronomy and livestock | KALRO digital agriculture ecosystem | Validated extension publications |
| Terrain and boundaries | Kenya GeoPortal | Open elevation and boundary datasets |

Every provider record must capture geographic coverage, spatial resolution, temporal resolution, update frequency, license, limitations, last successful retrieval, and health status.

## Architecture

```text
Coordinates
  -> provider adapters
  -> normalized environmental profile
  -> feature validation and normalization
  -> explicit suitability/risk rules
  -> evidence package
  -> optional grounded AI explanation
  -> localized user recommendation
```

Define typed interfaces for `WeatherProvider`, `ClimateProvider`, `SoilProvider`, `TerrainProvider`, `WaterProvider`, `CropKnowledgeProvider`, `LivestockKnowledgeProvider`, and `LocationProvider`. Provider failures must be isolated and reported; critical recommendations must declare which evidence was missing.

## Reliability

- Coordinate-grid caching with provider-specific TTLs.
- Explicit request timeouts, bounded retries with jitter, rate-limit protection, and provider circuit health.
- Fallback providers only when their data meaning and resolution are compatible.
- Display retrieval age and stale status; never silently present stale data as current.
- Preserve raw provider values separately from normalized values and interpretations.

## Experience and visual direction

Use a calm, map-first interface inspired by the breadth of resources curated in `kevindeasis/awesome-ui` and the polished product-design, responsive layout, reusable component, prototyping, and purposeful interaction approach demonstrated by [Designcode.io](https://designcode.io/).

- Warm agricultural palette: deep forest, leaf green, maize gold, soil neutrals, and high-contrast off-white.
- Strong information hierarchy, generous spacing, readable type, and restrained elevation.
- Treat the interface as a coherent design system: reusable tokens, consistent spacing, predictable states, and composable cards rather than one-off styling.
- Use motion sparingly to clarify transitions, loading, map selection, and evidence expansion; never let animation delay a field task.
- Dashboard cards must communicate status at a glance but expand into evidence and limitations.
- Maps are working tools, not decorative backgrounds.
- Avoid generic glassmorphism, excessive gradients, hidden navigation, and color-only status.
- Meet WCAG 2.2 AA contrast and keyboard interaction targets.
- Design mobile-first for field use, intermittent connectivity, and sunlight readability.

## Localization

- MVP languages: English and Kiswahili.
- Keep UI copy in translation dictionaries rather than components.
- Preserve units, crop names, source names, and scientific meaning during localization.
- Design future concise summaries for PWA, SMS, USSD, and messaging channels.

## Workstreams

1. **Data discovery:** validate access, licensing, authentication, coverage, resolution, and limits.
2. **Weather/climate:** define rainfall, temperature, humidity, anomalies, and outlook calculations.
3. **Soil/terrain/water:** build a normalized environmental profile.
4. **Agricultural knowledge:** curate Kenya-focused crop, planting, harvest, livestock, and practice data.
5. **Suitability engine:** define testable thresholds, weights, exclusions, confidence, and validation cases.
6. **Experience:** implement the responsive map-first workflow and explainability views.
7. **AI:** synthesize structured evidence, explain tradeoffs, localize language, and retain citations.

## Hackathon priorities

### Must have

- Kenyan location selection and coordinate resolution.
- Current/forecast weather and multi-year climate analysis.
- Soil and elevation/topography retrieval.
- One selected-crop evaluation and ranked alternatives using a documented method.
- Planting/harvest guidance where authoritative evidence exists.
- Responsible 21-day outlook with uncertainty.
- Source and explainability panel.

### Should have

- KALRO knowledge integration, water indicators, livestock recommendations, English/Kiswahili, and interactive charts.

### Stretch

- Groundwater/boreholes, vegetation health, farm boundaries and acreage, yield scenarios, market prices, pest/disease signals, and SMS/USSD delivery.

## Definition of done

The demo is ready when a user can select a Kenyan coordinate, view its weather/climate/soil/terrain profile, ask about a crop, receive explainable suitability and planting guidance, view a responsible 21-day outlook, and inspect the evidence without the system fabricating unavailable data.
