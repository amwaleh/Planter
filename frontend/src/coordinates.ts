export function initialCoordinates() {
  const query = new URLSearchParams(window.location.search);
  const latitudeValue = query.get("lat");
  const longitudeValue = query.get("lng");
  const latitude = latitudeValue === null || latitudeValue.trim() === "" ? Number.NaN : Number(latitudeValue);
  const longitude = longitudeValue === null || longitudeValue.trim() === "" ? Number.NaN : Number(longitudeValue);
  return {
    latitude: Number.isFinite(latitude) ? latitude : -0.7167,
    longitude: Number.isFinite(longitude) ? longitude : 36.4333,
  };
}
