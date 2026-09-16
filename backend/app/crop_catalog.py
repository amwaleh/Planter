from difflib import get_close_matches
from datetime import datetime, timezone

from .crop_data import CROP_RULES
from .models import CropCatalogItem, CropImageMetadata

# A broad working catalog compiled from crops commonly documented by East African
# agriculture and horticulture programs. It is intentionally not labelled exhaustive.
CATALOG_DATA = {
    "fruits": [
        ("avocado", ["avocados"]),
        ("banana", ["bananas"]),
        ("plantain", ["cooking banana"]),
        ("mango", ["mangoes"]),
        ("pineapple", ["pineapples"]),
        ("papaya", ["pawpaw"]),
        ("passion fruit", ["passionfruit"]),
        ("orange", ["oranges"]),
        ("lemon", ["lemons"]),
        ("lime", ["limes"]),
        ("grapefruit", []),
        ("mandarin", ["tangerine"]),
        ("guava", ["guavas"]),
        ("watermelon", ["watermelons"]),
        ("sweet melon", ["muskmelon", "cantaloupe"]),
        ("jackfruit", []),
        ("coconut", ["coconuts"]),
        ("tamarind", []),
        ("baobab", ["monkey bread tree"]),
        ("marula", []),
        ("desert date", ["balanites"]),
        ("jujube", ["ber", "sidr"]),
        ("tree tomato", ["tamarillo"]),
        ("loquat", []),
        ("strawberry", ["strawberries"]),
        ("grape", ["grapes"]),
        ("apple", ["apples"]),
        ("pear", ["pears"]),
        ("peach", ["peaches"]),
        ("plum", ["plums"]),
        ("pomegranate", []),
        ("cape gooseberry", ["physalis"]),
        ("custard apple", ["sugar apple"]),
        ("soursop", ["graviola"]),
        ("date", ["dates"]),
        ("fig", ["figs"]),
        ("mulberry", ["mulberries"]),
    ],
    "vegetables": [
        ("tomato", ["tomatoes"]),
        ("onion", ["onions"]),
        ("cabbage", ["cabbages"]),
        ("kale", ["kales", "sukuma wiki"]),
        ("spinach", []),
        ("amaranth", ["terere"]),
        ("African nightshade", ["managu"]),
        ("spider plant", ["saga", "saget"]),
        ("jute mallow", ["mrenda"]),
        ("cowpea leaves", ["kunde"]),
        ("Ethiopian kale", ["Abyssinian cabbage"]),
        ("pumpkin", ["pumpkins"]),
        ("pumpkin leaves", ["pumpkin greens"]),
        ("butternut squash", ["butternut"]),
        ("cucumber", ["cucumbers"]),
        ("zucchini", ["courgette"]),
        ("eggplant", ["aubergine", "brinjal"]),
        ("okra", ["lady fingers"]),
        ("carrot", ["carrots"]),
        ("beetroot", ["beets"]),
        ("radish", ["radishes"]),
        ("turnip", ["turnips"]),
        ("sweet pepper", ["bell pepper", "capsicum"]),
        ("chili pepper", ["chilli", "hot pepper"]),
        ("French beans", ["green beans"]),
        ("baby corn", []),
        ("garden peas", ["peas"]),
        ("snow peas", ["mangetout"]),
        ("broccoli", []),
        ("cauliflower", []),
        ("lettuce", []),
        ("celery", []),
        ("leek", ["leeks"]),
        ("garlic", []),
        ("spring onion", ["scallion"]),
        ("asparagus", []),
        ("artichoke", []),
        ("potato", ["Irish potato", "potatoes"]),
        ("sweet potato", ["sweet potatoes"]),
        ("cassava", []),
        ("cassava leaves", ["cassava greens"]),
        ("arrowroot", ["nduma"]),
        ("taro", ["cocoyam"]),
    ],
}

CATALOG_SOURCES = [
    "East African Community agriculture overview: https://www.eac.int/agriculture",
    "FAO bananas and tropical-fruit resources: https://www.fao.org/markets-and-trade/commodities-overview/bananas-tropical-fruits/",
    "World Vegetable Center Eastern and Southern Africa: https://www.worldveg.org/about-us/where-we-work/eastern-southern-africa/",
    "Traditional fruits and vegetables in Kenya and Ethiopia: https://doi.org/10.3389/fnut.2023.1197703",
    "Rwanda NAEB fresh-produce catalog: https://www.naeb.gov.rw/rwanda-fresh/products",
]


def list_crop_catalog() -> list[CropCatalogItem]:
    items: list[CropCatalogItem] = []
    for category, entries in CATALOG_DATA.items():
        for name, aliases in entries:
            normalized_key = "_".join(name.lower().replace("-", " ").split())
            items.append(
                CropCatalogItem(
                    name=name,
                    category=category,
                    aliases=aliases,
                    region="East Africa",
                    rule_status=(
                        "Validated prototype rule"
                        if normalized_key in CROP_RULES
                        else "Rule pending validation"
                    ),
                    wikipedia_title=name.title(),
                    source_notes=CATALOG_SOURCES,
                )
            )
    items_by_key = {
        "_".join(item.name.lower().replace("-", " ").split()): item for item in items
    }
    # Imported here to avoid coupling storage initialization to module import.
    from .storage import list_crop_rules

    for rule in list_crop_rules():
        image = (
            CropImageMetadata(
                crop_name=rule.name,
                image_url=rule.image_url,
                source_page_url=rule.image_source_page_url,
                creator=rule.image_creator or "User supplied",
                license=rule.image_license or "User supplied",
                license_url=rule.image_license_url,
                alt_text=rule.image_alt_text or f"{rule.name} plant or produce",
                retrieved_at=datetime.now(timezone.utc),
            )
            if rule.image_url and rule.image_source_page_url
            else None
        )
        existing = items_by_key.get(rule.key)
        if existing:
            existing.rule_status = "Validated prototype rule"
            existing.source_notes = list(dict.fromkeys([rule.source, *existing.source_notes]))
            if rule.custom:
                existing.wikipedia_title = rule.wikipedia_title or existing.wikipedia_title
                existing.image = image or existing.image
            if rule.custom and rule.category != "other":
                existing.category = rule.category
            continue
        item = CropCatalogItem(
            name=rule.name,
            category=rule.category,
            aliases=[],
            region="User supplied" if rule.custom else "Kenya prototype catalog",
            rule_status="Validated prototype rule",
            wikipedia_title=rule.wikipedia_title or rule.name.title(),
            source_notes=[rule.source],
            image=image,
        )
        items.append(item)
        items_by_key[rule.key] = item
    return sorted(items, key=lambda item: item.name.lower())


def resolve_catalog_name(value: str) -> tuple[CropCatalogItem | None, list[str]]:
    normalized = " ".join(value.strip().lower().replace("-", " ").split())
    items = list_crop_catalog()
    names: dict[str, CropCatalogItem] = {}
    for item in items:
        names[item.name.lower()] = item
        for alias in item.aliases:
            names[alias.lower()] = item
    if normalized in names:
        return names[normalized], []
    matches = get_close_matches(normalized, names, n=3, cutoff=0.68)
    suggestions = list(dict.fromkeys(names[match].name for match in matches))
    return None, suggestions
