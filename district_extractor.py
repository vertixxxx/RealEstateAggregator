import re
import unicodedata
from typing import Optional

def normalize_text(text: str) -> str:
    if not text:
        return ""
    # Strip Romanian diacritics: ă, â, î, ș, ț -> a, a, i, s, t
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join([c for c in nfkd if not unicodedata.combining(c)])
    return stripped.lower()

# Neighborhoods & popular aliases for each major city
CITY_DISTRICTS = {
    "Cluj-Napoca": {
        "Mănăștur": ["manastur"],
        "Mărăști": ["marasti"],
        "Gheorgheni": ["gheorgheni"],
        "Zorilor": ["zorilor"],
        "Grigorescu": ["grigorescu"],
        "Bună Ziua": ["buna ziua"],
        "Centru": ["centru", "central", "ultracentral", "piata unirii"],
        "Iris": ["iris"],
        "Între Lacuri": ["intre lacuri"],
        "Europa": ["europa"],
        "Andrei Mureșanu": ["andrei muresanu"],
        "Borhanci": ["borhanci"],
        "Sopor": ["sopor"],
        "Someșeni": ["someseni"],
        "Dâmbul Rotund": ["dambul rotund"],
        "Plopilor": ["plopilor"],
        "Gruia": ["gruia"],
        "Băița": ["baita"],
        "Baciu": ["baciu"],
        "Florești": ["floresti"],
    },
    "Brașov": {
        "Tractorul": ["tractorul", "coresi"],
        "Astra": ["astra"],
        "Centrul Istoric": ["centrul istoric", "centru vechi", "schei"],
        "Centrul Civic": ["centrul civic", "civic", "camera de comert"],
        "Răcădău": ["racadau", "valea cetatii"],
        "Bartolomeu": ["bartolomeu", "bartolomeu nord", "avantgarden"],
        "Noua": ["noua"],
        "Florilor": ["florilor"],
        "Craiter": ["craiter"],
        "Blumana": ["blumana"],
        "Stupini": ["stupini"],
        "Triaj": ["triaj"],
        "Griviței": ["grivitei"],
        "Scriitorilor": ["scriitorilor"],
    },
    "București": {
        "Militari": ["militari", "lujerului", "gorjului", "preciziei", "veteranilor", "militari residence"],
        "Drumul Taberei": ["drumul taberei", "favorit", "raul doamnei", "targu neamt", "dr taberei"],
        "Titan": ["titan", "1 decembrie", "ozana", "nicolae grigorescu", "liviu rebreanu", "postavarului"],
        "Berceni": ["berceni", "aparatorii patriei", "dimitrie leonida", "piata sudului", "brancoveanu"],
        "Dristor": ["dristor", "ramnicu valcea", "ramnicu sarat"],
        "Vitan": ["vitan", "vitan barzesti", "mall vitan", "oltenitei"],
        "Tineretului": ["tineretului", "timpuri noi", "sinai"],
        "Pantelimon": ["pantelimon", "delfinului", "socului"],
        "Colentina": ["colentina", "fundeni"],
        "Crângași": ["crangasi", "grozavesti", "semanatoarea"],
        "Pipera": ["pipera"],
        "Aviației": ["aviatiei", "aurel vlaicu"],
        "Floreasca": ["floreasca", "promenada"],
        "Dorobanți": ["dorobanti", "perla"],
        "Băneasa": ["baneasa", "sisesti", "antena 1"],
        "Cotroceni": ["cotroceni", "eroilor", "razoare"],
        "Tei": ["tei", "lacul tei", "barbu vacarescu"],
        "Ștefan cel Mare": ["stefan cel mare", "circului", "dinamo"],
        "Iancului": ["iancului", "protopopescu"],
        "Obor": ["obor", "mosilor"],
        "Centru / Romană": ["universitate", "romana", "piata romana", "victoriei", "piata victoriei", "unirii", "piata unirii"],
        "Rahova": ["rahova", "sebastian", "salaj"],
        "Bucureștii Noi": ["bucurestii noi", "damaroaia", "pajura", "jiului"],
        "Sector 1": ["sector 1", "sectorul 1"],
        "Sector 2": ["sector 2", "sectorul 2"],
        "Sector 3": ["sector 3", "sectorul 3"],
        "Sector 4": ["sector 4", "sectorul 4"],
        "Sector 5": ["sector 5", "sectorul 5"],
        "Sector 6": ["sector 6", "sectorul 6"],
    },
}

def extract_district_from_title(title: str, city: str) -> Optional[str]:
    if not title or not city:
        return None

    # Find the right city dictionary regardless of accents
    matched_city_dict = None
    normalized_city = normalize_text(city)
    for c_key, dist_dict in CITY_DISTRICTS.items():
        if normalize_text(c_key) == normalized_city:
            matched_city_dict = dist_dict
            break

    if not matched_city_dict:
        return None

    normalized_title = normalize_text(title)

    # Sort aliases by character length descending (so "militari residence" matches before "militari")
    for district_name, aliases in matched_city_dict.items():
        sorted_aliases = sorted(aliases, key=len, reverse=True)
        for alias in sorted_aliases:
            # Match whole words only
            pattern = rf"\b{re.escape(alias)}\b"
            if re.search(pattern, normalized_title):
                return district_name

    return None