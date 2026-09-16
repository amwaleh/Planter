import { useState } from "react";

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
  return (
    <form
      className="coordinate-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Number(latitudeInput), Number(longitudeInput));
      }}
    >
      <label>Latitude<input value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} inputMode="decimal" /></label>
      <label>Longitude<input value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} inputMode="decimal" /></label>
      <button className="primary-button" type="submit">Load location</button>
    </form>
  );
}
