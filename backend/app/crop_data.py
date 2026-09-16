from dataclasses import dataclass
from difflib import get_close_matches


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
    "avocado": CropRule(
        "avocado", (16, 28), (80, 160), (900, 2100), (900, 1500),
        "Establish at the onset of dependable rains and plan supplemental water during dry establishment periods.",
        ("Poor drainage can cause root disease.", "Young trees are vulnerable to prolonged drought and strong wind."),
    ),
    "banana": CropRule(
        "banana", (20, 32), (100, 200), (0, 1800), (270, 450),
        "Plant when sustained moisture is available; year-round production normally needs reliable water.",
        ("Wind can damage leaves and stems.", "Moisture stress reduces bunch development."),
    ),
    "cabbage": CropRule(
        "cabbage", (12, 24), (45, 100), (800, 2800), (70, 140),
        "Schedule establishment in a cool period with dependable moisture and good drainage.",
        ("High heat can reduce head quality.", "Persistent leaf wetness increases disease pressure."),
    ),
    "carrot": CropRule(
        "carrot", (15, 25), (35, 80), (700, 2600), (75, 120),
        "Use a cool growing window and maintain even soil moisture during root development.",
        ("Waterlogging can deform roots.", "High temperatures can reduce root colour and quality."),
    ),
    "cassava": CropRule(
        "cassava", (20, 32), (45, 120), (0, 1800), (240, 540),
        "Plant healthy material after effective rains begin; locally recommended varieties determine harvest timing.",
        ("Waterlogging can cause root rot.", "Long establishment droughts reduce stand survival."),
    ),
    "coffee": CropRule(
        "coffee", (15, 26), (90, 180), (1200, 2200), (900, 1500),
        "Establish with dependable rains and follow Kenya-specific variety, shade, and management guidance.",
        ("Heat and moisture stress can reduce flowering and berry fill.", "Excess humidity can increase disease pressure."),
    ),
    "cowpea": CropRule(
        "cowpea", (20, 35), (25, 75), (0, 1800), (60, 120),
        "Plant after effective rainfall begins; choose locally adapted maturity and growth type.",
        ("Waterlogging is unsuitable.", "Heavy rain during flowering can reduce pod set."),
    ),
    "green_gram": CropRule(
        "green gram", (20, 35), (25, 70), (0, 1800), (60, 100),
        "Plant with the start of reliable short rains and avoid a wet harvest period.",
        ("Waterlogging and prolonged humidity increase disease risk.", "Rain during maturity can damage grain quality."),
    ),
    "kale": CropRule(
        "kale", (12, 27), (40, 100), (600, 2800), (55, 90),
        "Plant into a cool-to-mild period with a dependable water supply for repeated harvest.",
        ("Heat can reduce leaf quality.", "High humidity can increase foliar disease pressure."),
    ),
    "mango": CropRule(
        "mango", (20, 35), (40, 110), (0, 1600), (900, 1800),
        "Establish at the onset of rains; flowering and harvest guidance must match the local production zone.",
        ("Rain during flowering can reduce fruit set.", "Young trees require protection from severe moisture stress."),
    ),
    "millet": CropRule(
        "millet", (20, 35), (20, 70), (0, 2000), (70, 120),
        "Plant after effective rains begin using a locally adapted early- or medium-maturity variety.",
        ("Waterlogging is unsuitable.", "Bird pressure can be significant around grain maturity."),
    ),
    "peas": CropRule(
        "peas", (10, 24), (45, 100), (1400, 3000), (75, 130),
        "Use a cool growing window with adequate moisture and avoid persistent wetness near harvest.",
        ("High temperatures reduce flowering and pod fill.", "Wet foliage can increase disease pressure."),
    ),
    "pineapple": CropRule(
        "pineapple", (20, 32), (60, 140), (0, 1800), (450, 720),
        "Establish healthy planting material when dependable moisture is available in a warm, well-drained field.",
        ("Waterlogging can cause root and heart rot.", "Cold conditions slow growth and fruit development."),
    ),
    "rice": CropRule(
        "rice", (20, 35), (100, 220), (0, 1800), (100, 180),
        "Use only where a suitable production system and reliable water-management plan are established.",
        ("Water availability and control are critical.", "Flooding suitability cannot be inferred from rainfall alone."),
    ),
    "spinach": CropRule(
        "spinach", (10, 25), (35, 90), (500, 2800), (35, 65),
        "Plant in a cool period and maintain consistent moisture without waterlogging.",
        ("Heat can cause premature bolting.", "Persistent wetness raises foliar disease risk."),
    ),
    "sugarcane": CropRule(
        "sugarcane", (20, 34), (100, 200), (0, 1800), (360, 600),
        "Establish only with a long-season water plan and locally validated production guidance.",
        ("Long dry periods reduce cane growth.", "Poor drainage can restrict roots and field access."),
    ),
    "sweet_potato": CropRule(
        "sweet potato", (18, 32), (40, 100), (0, 2200), (90, 180),
        "Plant healthy vines after effective rains begin and ensure well-drained rooting conditions.",
        ("Waterlogging can cause root rot.", "Drought during establishment can reduce storage-root formation."),
    ),
    "tea": CropRule(
        "tea", (13, 25), (100, 220), (1500, 2700), (900, 1800),
        "Establishment requires a suitable highland production zone and Kenya-specific industry guidance.",
        ("Heat and prolonged drought reduce shoot growth.", "Site suitability also depends strongly on soil acidity and drainage."),
    ),
    "watermelon": CropRule(
        "watermelon", (22, 35), (25, 70), (0, 1800), (70, 110),
        "Plant into a warm period with controlled moisture and a relatively dry fruit-maturity window.",
        ("Waterlogging and high humidity increase disease risk.", "Irregular moisture can reduce fruit quality."),
    ),
    "wheat": CropRule(
        "wheat", (10, 25), (35, 90), (1500, 3000), (100, 160),
        "Match planting to the locally recommended highland season and variety maturity.",
        ("High temperature during grain fill reduces yield.", "Rain near maturity can damage grain quality."),
    ),
}

CROP_ALIASES = {
    "bean": "beans",
    "corn": "maize",
    "irish potato": "potato",
    "kales": "kale",
    "mung bean": "green_gram",
    "mung beans": "green_gram",
    "green grams": "green_gram",
    "onions": "onion",
    "potatoes": "potato",
    "pineapples": "pineapple",
    "sweet potatoes": "sweet_potato",
    "tomatoes": "tomato",
}


def crop_display_name(crop_key: str) -> str:
    return CROP_RULES[crop_key].name


def resolve_crop_name(value: str) -> tuple[str | None, bool, list[str]]:
    normalized = " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())
    key_by_name = {
        crop_display_name(key).lower(): key
        for key in CROP_RULES
    }
    alias_key = CROP_ALIASES.get(normalized)
    if alias_key is not None:
        return alias_key, True, []
    if normalized in key_by_name:
        key = key_by_name[normalized]
        return key, key != normalized, []

    candidates = list(key_by_name) + list(CROP_ALIASES)
    matches = get_close_matches(normalized, candidates, n=3, cutoff=0.68)
    if not matches:
        return None, False, []

    suggestions = [
        crop_display_name(CROP_ALIASES.get(match, key_by_name.get(match, match)))
        for match in matches
    ]
    best_key = CROP_ALIASES.get(matches[0], key_by_name.get(matches[0]))
    if best_key is None:
        return None, False, suggestions
    return best_key, True, suggestions
