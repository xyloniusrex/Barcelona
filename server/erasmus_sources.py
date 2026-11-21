"""Official Erasmus+ national agency sites, one per partner university's
country (server/seed.py). Verified live and reachable from this container
when added; a site going down or changing its domain shows up as an error
in the admin "Sources" tab rather than silently breaking the scan.
"""

SOURCES = [
    {"country": "Austria", "agency": "OeAD - Erasmus+ Österreich", "url": "https://erasmusplus.oead.at/"},
    {"country": "Belgium", "agency": "EPOS Vlaanderen", "url": "https://www.epos-vlaanderen.be/"},
    {"country": "Latvia", "agency": "Erasmus+ Latvija (VIAA)", "url": "https://www.erasmusplus.lv/"},
    {"country": "Netherlands", "agency": "Erasmus+ Nederland (Nuffic)", "url": "https://www.erasmusplus.nl/"},
    {"country": "Germany", "agency": "Nationale Agentur für Erasmus+ Hochschulzusammenarbeit (DAAD)", "url": "https://eu.daad.de/"},
    {"country": "Finland", "agency": "Finnish National Agency for Education (EDUFI)", "url": "https://www.oph.fi/en"},
    {"country": "Hungary", "agency": "Tempus Public Foundation", "url": "https://tka.hu/"},
    {"country": "Portugal", "agency": "Erasmus+ Educação e Formação (IES, I.P.)", "url": "https://erasmusmais.pt/"},
]
