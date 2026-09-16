EAST_AFRICA_LATITUDE_MIN = -12.5
EAST_AFRICA_LATITUDE_MAX = 18.5
EAST_AFRICA_LONGITUDE_MIN = 22.5
EAST_AFRICA_LONGITUDE_MAX = 52.5

EAST_AFRICA_COUNTRY_CODES = {
    "BI",
    "DJ",
    "ER",
    "ET",
    "KE",
    "RW",
    "SO",
    "SS",
    "TZ",
    "UG",
}


def is_within_east_africa(latitude: float, longitude: float) -> bool:
    return (
        EAST_AFRICA_LATITUDE_MIN <= latitude <= EAST_AFRICA_LATITUDE_MAX
        and EAST_AFRICA_LONGITUDE_MIN <= longitude <= EAST_AFRICA_LONGITUDE_MAX
    )
