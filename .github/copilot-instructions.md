# Copilot Instructions for Planter

## Mission

Build a trustworthy Kenya-first agricultural decision-support product. Read `PLAN.md` before implementing features. Prefer a smaller evidence-backed capability over a broader feature that guesses.

## Architecture

- Maintain a React/TypeScript frontend and Python/FastAPI backend.
- Keep external APIs behind typed provider interfaces.
- Normalize provider output into evidence records before scoring or explanation.
- Preserve raw source values; derived values must name their method and inputs.
- Keep recommendation logic deterministic and unit-testable. AI may explain evidence but must not create environmental facts or override hard safety constraints.
- Use coordinates as the canonical farm identifier. Treat administrative names as context.

## Data and responsible AI

- Never invent unavailable data or substitute one environmental concept for another.
- Never infer groundwater depth from rainfall, surface water, vegetation, or soil moisture.
- Never present modelled soil as a laboratory test, historical climatology as a forecast, or an AI score as scientific measurement.
- Include `kind`, `provider`, `retrieved_at`, `confidence`, and `limitations` in evidence.
- Prefer suitability categories. A numeric score is allowed only when its factors, thresholds, weights, missing-data behavior, and confidence method are documented.
- Do not provide fertilizer dosage, veterinary diagnosis/treatment, or safety-critical claims without suitable authoritative evidence.
- Surface partial provider failures and stale data in the API and UI.

## Backend

- Use Pydantic models at boundaries and type annotations throughout.
- HTTP calls require explicit timeouts, status handling, and provider-specific error messages.
- Use bounded retries only for transient failures; do not broadly catch and hide exceptions.
- Validate latitude `[-90, 90]` and longitude `[-180, 180]`; MVP location workflows should constrain selected points to Kenya.
- Keep crop rules in structured data, separate from scoring code.
- Add focused tests for calculations, boundary values, missing evidence, and confidence degradation.

## Frontend

- Use React function components and TypeScript without `any`.
- Use Leaflet/React Leaflet for the interactive map.
- Keep server state, UI state, and derived display state distinct.
- Provide loading, partial-data, stale-data, empty, and error states.
- Use semantic HTML, keyboard-operable controls, visible focus, and WCAG 2.2 AA contrast.
- Do not communicate severity or confidence by color alone.
- Keep farmer-facing language concise and place technical details in expandable evidence views.
- Put translatable copy in locale dictionaries as localization expands.

## Design direction

- Draw inspiration from the curated UI/UX references in `kevindeasis/awesome-ui` and Designcode.io's polished app design, reusable systems, responsive composition, prototyping, and purposeful interaction approach; do not copy proprietary layouts or assets.
- Use a warm agricultural palette, strong typography, clear hierarchy, generous spacing, restrained motion, and high sunlight readability.
- Build reusable design tokens and composable components; avoid isolated visual decisions that make the product inconsistent.
- Make the map a primary task surface.
- Avoid generic dashboard clutter, excessive gradients, glassmorphism, tiny chart labels, and decorative metrics without decisions attached.
- Design mobile-first, then enhance for desktop.

## Source and licensing hygiene

- Record provider coverage, resolution, update frequency, license, limitations, and last successful retrieval.
- Do not commit API keys, access tokens, downloaded restricted datasets, or provider credentials.
- Attribute OpenStreetMap and all other map/data providers according to their licenses.
- Prefer authoritative Kenyan sources for agronomic recommendations and clearly identify global fallback datasets.

## Definition of complete

A change is complete only when behavior is implemented end-to-end, tests cover the meaningful rule or transformation, errors remain visible, sources are attributed, and documentation is updated when contracts or scoring methods change.
