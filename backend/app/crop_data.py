from dataclasses import dataclass


@dataclass(frozen=True)
class CropRule:
    name: str
    temperature_range: tuple[float, float]
    preferred_monthly_rainfall: tuple[float, float]
    elevation_range: tuple[float, float]
    duration_days: tuple[int, int]
    planting_guidance: str
    sensitivities: tuple[str, ...]


CROP_RULES = {
    "onion": CropRule(
        "onion",
        (13, 30),
        (35, 90),
        (500, 2400),
        (90, 150),
        "Use the local rainy-season onset or reliable irrigation; confirm the exact window with county guidance.",
        ("Waterlogging can damage bulbs.", "Heavy rain near maturity can reduce bulb quality."),
    ),
    "maize": CropRule(
        "maize",
        (18, 32),
        (60, 140),
        (0, 2500),
        (90, 180),
        "Plant after effective rains are established, using a locally recommended maturity class.",
        ("Dry spells around flowering can sharply reduce yield.", "Excess moisture can increase disease pressure."),
    ),
    "beans": CropRule(
        "beans",
        (15, 27),
        (50, 100),
        (600, 2200),
        (70, 120),
        "Plant with dependable rainfall and avoid scheduling maturity into a persistently wet period.",
        ("Waterlogging and high humidity can increase disease risk.", "Heat during flowering can reduce pod set."),
    ),
    "potato": CropRule(
        "potato",
        (10, 24),
        (55, 110),
        (1400, 3000),
        (90, 150),
        "Use certified guidance for the local highland season and protect establishment from water stress.",
        ("High heat reduces tuber formation.", "Persistent humidity can increase late-blight pressure."),
    ),
    "sorghum": CropRule(
        "sorghum",
        (20, 35),
        (30, 80),
        (0, 1800),
        (100, 140),
        "Plant after effective rainfall begins; locally adapted varieties can tolerate shorter seasons.",
        ("Waterlogging is unsuitable.", "Bird pressure can be significant near grain maturity."),
    ),
    "tomato": CropRule(
        "tomato",
        (18, 29),
        (40, 90),
        (0, 2200),
        (90, 140),
        "Align transplanting with a manageable rain period and a reliable water plan.",
        ("High humidity and leaf wetness increase disease pressure.", "Irregular watering can damage fruit quality."),
    ),
}

