import { useEffect, useState } from "react";

export function CoordinateForm({
  latitude,
  longitude,
  onSubmit,
}: {
  latitude: number;
  longitude: number;
  onSubmit: (latitude: number, longitude: number) => void;
}) {
  const [latitudeInput, setLatitudeInput] = useState(latitude.toString());
  const [longitudeInput, setLongitudeInput] = useState(longitude.toString());
  const [validationError, setValidationError] = useState<string | null>(null);
  useEffect(() => {
    setLatitudeInput(latitude.toFixed(6));
    setLongitudeInput(longitude.toFixed(6));
  }, [latitude, longitude]);
  return (
    <form
      className="coordinate-form"
      onSubmit={(event) => {
        event.preventDefault();
        const nextLatitude = Number(latitudeInput);
        const nextLongitude = Number(longitudeInput);
        if (
          !Number.isFinite(nextLatitude) ||
          !Number.isFinite(nextLongitude) ||
          nextLatitude < -4.9 ||
          nextLatitude > 5 ||
          nextLongitude < 33.5 ||
          nextLongitude > 42.1
        ) {
          setValidationError("Enter coordinates within Kenya: latitude -4.9 to 5.0 and longitude 33.5 to 42.1.");
          return;
        }
        setValidationError(null);
        onSubmit(nextLatitude, nextLongitude);
      }}
    >
      <label>Latitude<input value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} inputMode="decimal" /></label>
      <label>Longitude<input value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} inputMode="decimal" /></label>
      <button className="primary-button" type="submit">Load location</button>
      {validationError && <p className="coordinate-error" role="alert">{validationError}</p>}
    </form>
  );
}
