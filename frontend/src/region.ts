export const EAST_AFRICA_BOUNDS = {
  latitudeMin: -12.5,
  latitudeMax: 18.5,
  longitudeMin: 22.5,
  longitudeMax: 52.5,
} as const;

export function isWithinEastAfrica(latitude: number, longitude: number) {
  return (
    latitude >= EAST_AFRICA_BOUNDS.latitudeMin &&
    latitude <= EAST_AFRICA_BOUNDS.latitudeMax &&
    longitude >= EAST_AFRICA_BOUNDS.longitudeMin &&
    longitude <= EAST_AFRICA_BOUNDS.longitudeMax
  );
}

export const EAST_AFRICA_COORDINATE_HELP =
  "Enter Eastern Africa coordinates: latitude -12.5 to 18.5 and longitude 22.5 to 52.5.";
