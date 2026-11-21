"""Seed data for the PoliGo prototype.

Partner universities: the E3UDRES2 shortlist from the app spec plus the extra
partners from the PoliGo design repo (Saxion, Fulda, JAMK, MATE). They are DEMO
data - the courses and the matches are illustrative, confirm the real
agreements with the UPT Erasmus Office before presenting them as official.
Matches are precomputed once and stored, so the demo is instant and
deterministic; on-the-fly matching plugs in later (run_matching.py hook).

seed() is idempotent: it only inserts rows that are missing, so adding a
university here reaches existing databases on the next start.
"""
from server.db import j
from server.db import parse
from server.db import db
from server.db import init_db

PROGRAM = "Computer Science"

HOME_COURSES = [
    {"id": "ac-ai", "name": "Artificial Intelligence", "ects": 6, "type": "mandatory", "topics": ["search", "constraint satisfaction", "machine learning", "neural networks", "ethics"]},
    {"id": "ac-os", "name": "Operating Systems", "ects": 5, "type": "mandatory", "topics": ["processes", "threads", "scheduling", "memory management", "file systems"]},
    {"id": "ac-net", "name": "Computer Networks", "ects": 5, "type": "mandatory", "topics": ["TCP/IP", "routing", "sockets", "HTTP", "network security"]},
    {"id": "ac-comp", "name": "Compiler Design", "ects": 6, "type": "mandatory", "topics": ["lexical analysis", "parsing", "semantic analysis", "code generation"]},
    {"id": "ac-db", "name": "Databases", "ects": 4, "type": "mandatory", "topics": ["SQL", "transactions", "indexing", "normalization"]},
    {"id": "ac-se", "name": "Software Engineering", "ects": 4, "type": "mandatory", "topics": ["agile methods", "testing", "design patterns", "version control"]},
]

UNIVERSITIES = [
    {"id": "stpolten", "name": "St. Pölten University of Applied Sciences", "city": "St. Pölten", "country": "Austria", "country_code": "AT", "lat": 48.20, "lng": 15.63, "languages": ["German", "English"], "website": "https://www.fhstp.ac.at/en", "greeting": "Gute Reise!"},
    {"id": "setubal", "name": "Instituto Politécnico de Setúbal", "city": "Setúbal", "country": "Portugal", "country_code": "PT", "lat": 38.52, "lng": -8.89, "languages": ["Portuguese", "English"], "website": "https://www.ips.pt", "greeting": "Boa viagem!"},
    {"id": "leuven", "name": "UC Leuven-Limburg", "city": "Leuven", "country": "Belgium", "country_code": "BE", "lat": 50.88, "lng": 4.70, "languages": ["English", "Dutch"], "website": "https://www.ucll.be/en", "greeting": "Goede reis!"},
    {"id": "vidzeme", "name": "Vidzeme University of Applied Sciences", "city": "Valmiera", "country": "Latvia", "country_code": "LV", "lat": 57.54, "lng": 25.43, "languages": ["English", "Latvian"], "website": "https://www.va.lv/en", "greeting": "Laimīgu ceļu!"},
    {"id": "saxion", "name": "Saxion University of Applied Sciences", "city": "Enschede", "country": "Netherlands", "country_code": "NL", "lat": 52.22, "lng": 6.89, "languages": ["English", "Dutch"], "website": "https://www.saxion.edu", "greeting": "Goede reis!"},
    {"id": "fulda", "name": "Hochschule Fulda - University of Applied Sciences", "city": "Fulda", "country": "Germany", "country_code": "DE", "lat": 50.56, "lng": 9.68, "languages": ["English", "German"], "website": "https://www.hs-fulda.de/en", "greeting": "Gute Reise!"},
    {"id": "jamk", "name": "JAMK University of Applied Sciences", "city": "Jyväskylä", "country": "Finland", "country_code": "FI", "lat": 62.24, "lng": 25.75, "languages": ["English", "Finnish"], "website": "https://www.jamk.fi/en", "greeting": "Hyvää matkaa!"},
    {"id": "mate", "name": "Hungarian University of Agriculture and Life Sciences", "city": "Gödöllő", "country": "Hungary", "country_code": "HU", "lat": 47.60, "lng": 19.36, "languages": ["English", "Hungarian"], "website": "https://uni-mate.hu", "greeting": "Jó utat!"},
]

PARTNER_COURSES = [
    # St. Pölten UAS
    {"id": "stp-ai", "university_id": "stpolten", "name": "Machine Learning", "ects": 6, "semester": 2, "language": "English", "description": "Supervised and unsupervised learning, model evaluation, small neural nets."},
    {"id": "stp-osd", "university_id": "stpolten", "name": "Systems Programming", "ects": 5, "semester": 2, "language": "English", "description": "Processes, signals, scheduling, low-level system calls in C."},
    {"id": "stp-net", "university_id": "stpolten", "name": "Network Technologies", "ects": 5, "semester": 2, "language": "English", "description": "TCP/IP stack, routing, network services and security basics."},
    {"id": "stp-cg", "university_id": "stpolten", "name": "Media Informatics", "ects": 5, "semester": 2, "language": "German", "description": "Computer graphics fundamentals, rendering, interaction."},
    {"id": "stp-db", "university_id": "stpolten", "name": "Databases", "ects": 4, "semester": 2, "language": "English", "description": "Relational modelling, SQL, transactions and normalization."},
    {"id": "stp-se", "university_id": "stpolten", "name": "Software Engineering", "ects": 4, "semester": 2, "language": "English", "description": "Agile development, testing strategies, collaborative tooling."},
    # Instituto Politécnico de Setúbal
    {"id": "set-ai", "university_id": "setubal", "name": "Artificial Intelligence", "ects": 6, "semester": 2, "language": "Portuguese", "description": "Search, knowledge representation, machine learning and applications."},
    {"id": "set-sop", "university_id": "setubal", "name": "Operating Systems", "ects": 6, "semester": 2, "language": "Portuguese", "description": "Processes, threads, scheduling, memory and file systems."},
    {"id": "set-red", "university_id": "setubal", "name": "Computer Networks", "ects": 6, "semester": 2, "language": "Portuguese", "description": "Layered architectures, TCP/IP, routing and socket programming."},
    {"id": "set-comp", "university_id": "setubal", "name": "Programming Languages", "ects": 5, "semester": 2, "language": "Portuguese", "description": "Syntax, parsing and translation; interpreters and runtimes."},
    {"id": "set-bd", "university_id": "setubal", "name": "Databases", "ects": 6, "semester": 2, "language": "Portuguese", "description": "Relational calculus, SQL, transaction management, indexing."},
    {"id": "set-es", "university_id": "setubal", "name": "Software Engineering", "ects": 6, "semester": 2, "language": "English", "description": "Requirements, agile process, testing and design patterns."},
    # UC Leuven-Limburg
    {"id": "ucll-ai", "university_id": "leuven", "name": "Applied AI", "ects": 6, "semester": 2, "language": "English", "description": "Machine learning pipelines, neural networks, responsible AI."},
    {"id": "ucll-sys", "university_id": "leuven", "name": "Operating Systems & Infrastructure", "ects": 5, "semester": 2, "language": "English", "description": "Linux internals, virtualization, scheduling and storage."},
    {"id": "ucll-net", "university_id": "leuven", "name": "Networking", "ects": 5, "semester": 2, "language": "English", "description": "TCP/IP, switching, routing, services, network security."},
    {"id": "ucll-pl", "university_id": "leuven", "name": "Functional Programming", "ects": 5, "semester": 2, "language": "English", "description": "Syntax and semantics, interpreters, type systems."},
    {"id": "ucll-db", "university_id": "leuven", "name": "Data Management", "ects": 4, "semester": 2, "language": "English", "description": "SQL, NoSQL stores, transactions, data modelling."},
    {"id": "ucll-se", "university_id": "leuven", "name": "Software Project", "ects": 6, "semester": 2, "language": "English", "description": "Team project with agile process, testing and delivery."},
    # Vidzeme UAS
    {"id": "vid-ml", "university_id": "vidzeme", "name": "Introduction to Data Science", "ects": 5, "semester": 2, "language": "English", "description": "Data cleaning, statistics, basic machine learning."},
    {"id": "vid-os", "university_id": "vidzeme", "name": "Computer Systems", "ects": 4, "semester": 2, "language": "English", "description": "Computer architecture, OS basics, processes and memory."},
    {"id": "vid-net", "university_id": "vidzeme", "name": "Web Technologies", "ects": 4, "semester": 2, "language": "English", "description": "HTTP, client-server apps, REST APIs, web security."},
    {"id": "vid-prog", "university_id": "vidzeme", "name": "Advanced Programming", "ects": 6, "semester": 2, "language": "English", "description": "Language paradigms, compilers overview, code generation."},
    {"id": "vid-se", "university_id": "vidzeme", "name": "Software Engineering", "ects": 4, "semester": 2, "language": "English", "description": "Software lifecycle, testing, version control, teamwork."},
    # Saxion
    {"id": "sax-ds", "university_id": "saxion", "name": "Data Science", "ects": 5, "semester": 2, "language": "English", "description": "Statistics, data pipelines, machine learning and model evaluation."},
    {"id": "sax-os", "university_id": "saxion", "name": "Operating Systems & Linux", "ects": 5, "semester": 2, "language": "English", "description": "Processes, scheduling, memory management and Linux administration."},
    {"id": "sax-net", "university_id": "saxion", "name": "Networking", "ects": 5, "semester": 2, "language": "English", "description": "TCP/IP, routing, sockets and network security basics."},
    {"id": "sax-db", "university_id": "saxion", "name": "Databases", "ects": 5, "semester": 2, "language": "English", "description": "Relational modelling, SQL, transactions and normalization."},
    {"id": "sax-se", "university_id": "saxion", "name": "Software Testing & Quality", "ects": 5, "semester": 2, "language": "English", "description": "Test strategies, design patterns, requirements and quality assurance."},
    # Hochschule Fulda
    {"id": "ful-is", "university_id": "fulda", "name": "Intelligent Systems", "ects": 5, "semester": 2, "language": "English", "description": "Search, logic-based reasoning and machine learning."},
    {"id": "ful-os", "university_id": "fulda", "name": "Operating Systems", "ects": 5, "semester": 2, "language": "English", "description": "Processes, threads, scheduling, memory and file systems."},
    {"id": "ful-net", "university_id": "fulda", "name": "Computer Networks", "ects": 5, "semester": 2, "language": "English", "description": "Layered networks, TCP/IP, routing, sockets, wireless and security."},
    {"id": "ful-fl", "university_id": "fulda", "name": "Formal Languages & Automata", "ects": 5, "semester": 2, "language": "English", "description": "Grammars, automata and parsing techniques."},
    {"id": "ful-db", "university_id": "fulda", "name": "Database Systems", "ects": 5, "semester": 2, "language": "English", "description": "Relational model, SQL, normalization and transactions."},
    {"id": "ful-spo", "university_id": "fulda", "name": "Software Project Organisation", "ects": 5, "semester": 2, "language": "English", "description": "Agile methods, teamwork and project planning."},
    # JAMK
    {"id": "jam-ml", "university_id": "jamk", "name": "Machine Learning & Data Analytics", "ects": 5, "semester": 2, "language": "English", "description": "Supervised learning, neural network basics and data analytics."},
    {"id": "jam-lin", "university_id": "jamk", "name": "Linux Server Administration", "ects": 5, "semester": 2, "language": "English", "description": "Linux processes, file systems and server management."},
    {"id": "jam-net", "university_id": "jamk", "name": "Network Technologies", "ects": 5, "semester": 2, "language": "English", "description": "TCP/IP, routing, wireless networks and network security."},
    {"id": "jam-db", "university_id": "jamk", "name": "Database Design", "ects": 5, "semester": 2, "language": "English", "description": "Relational design, SQL, normalization and indexing."},
    {"id": "jam-sdm", "university_id": "jamk", "name": "Software Development Methods", "ects": 5, "semester": 2, "language": "English", "description": "Agile process, testing, version control and design patterns."},
    # MATE
    {"id": "mat-ida", "university_id": "mate", "name": "Intelligent Data Analysis", "ects": 5, "semester": 2, "language": "English", "description": "Data mining and machine learning applied to sensor and farm data."},
    {"id": "mat-net", "university_id": "mate", "name": "Networks and IoT", "ects": 5, "semester": 2, "language": "English", "description": "TCP/IP basics, sensor networks and network security."},
    {"id": "mat-gis", "university_id": "mate", "name": "GIS Databases", "ects": 5, "semester": 2, "language": "English", "description": "SQL, spatial data and database design."},
    {"id": "mat-web", "university_id": "mate", "name": "Web Development Basics", "ects": 5, "semester": 2, "language": "English", "description": "HTTP, client-side programming and version control."},
]

# ============================================================================
# TEMPORARY FICTIONAL DEMO DATA - not real institutions, not real partnerships.
# Generated (not hand-written) across many countries/regions/languages/match
# qualities so the map's filters have enough real variety to exercise, while
# the real partner list above stays short and honest. To remove: delete this
# whole block and the three "+ TEMP_..." references inside seed() below.
# ============================================================================
import hashlib as _hashlib

# (country, ISO 3166-1 alpha-2, approx lat, approx lng, primary language)
# Kept disjoint from the real partners' countries above, so the demo spread
# covers new ground on the globe instead of piling dots on the same spots.
_DEMO_COUNTRIES = [
    ("France", "FR", 47.0, 2.3, "French"),
    ("Italy", "IT", 43.5, 11.9, "Italian"),
    ("Spain", "ES", 40.2, -3.6, "Spanish"),
    ("Greece", "GR", 38.2, 23.7, "Greek"),
    ("Poland", "PL", 52.0, 19.3, "Polish"),
    ("Czechia", "CZ", 49.9, 15.4, "Czech"),
    ("Slovakia", "SK", 48.8, 19.5, "Slovak"),
    ("Slovenia", "SI", 46.1, 14.9, "Slovenian"),
    ("Croatia", "HR", 45.3, 16.3, "Croatian"),
    ("Serbia", "RS", 44.2, 20.8, "Serbian"),
    ("Bulgaria", "BG", 42.8, 25.3, "Bulgarian"),
    ("Sweden", "SE", 59.2, 15.0, "Swedish"),
    ("Norway", "NO", 60.8, 8.5, "Norwegian"),
    ("Denmark", "DK", 56.1, 10.2, "Danish"),
    ("Ireland", "IE", 53.3, -7.8, "Irish"),
    ("Lithuania", "LT", 55.3, 23.9, "Lithuanian"),
    ("Estonia", "EE", 58.7, 25.1, "Estonian"),
    ("United Kingdom", "GB", 54.0, -2.0, "English"),
    ("Switzerland", "CH", 46.8, 8.2, "German"),
    ("Iceland", "IS", 64.9, -19.0, "Icelandic"),
    ("Malta", "MT", 35.9, 14.4, "Maltese"),
    ("Cyprus", "CY", 35.1, 33.4, "Greek"),
    ("Luxembourg", "LU", 49.8, 6.1, "French"),
    ("Turkey", "TR", 38.9, 35.2, "Turkish"),
    ("Montenegro", "ME", 42.7, 19.3, "Montenegrin"),
    ("North Macedonia", "MK", 41.6, 21.7, "Macedonian"),
    ("Albania", "AL", 41.0, 20.0, "Albanian"),
    ("Bosnia and Herzegovina", "BA", 43.9, 17.7, "Bosnian"),
]
_DEMO_NAME_PATTERNS = [
    "Institute of Applied Sciences", "Polytechnic University",
    "University of Technology", "School of Engineering and Informatics",
    "Institute of Information Technology", "College of Engineering",
    "University of Applied Sciences", "National Technical University",
    "Institute for Digital Innovation",
]
_DEMO_CITY_PREFIXES = ["North", "East", "West", "South", "New", "Upper", "Lower", "Great", "Little", "Old", "Fair"]
_DEMO_CITY_ROOTS = ["brook", "field", "haven", "ford", "mont", "vale", "wick", "burg", "dale", "bridge", "holm", "stead", "gate", "cross"]


def _demo_pick(seq, *salt):
    digest = _hashlib.md5("-".join(str(s) for s in salt).encode()).hexdigest()
    return seq[int(digest, 16) % len(seq)]


def _generate_fictional_universities(count=168):
    """Deterministic (same output every run, nothing random) so the demo
    data does not shuffle around between server restarts.

    The map's "match quality" filter buckets a university by the FRACTION of
    its courses that have any partner at all (label != "none"), not by the
    per-course label - so to get a real good/partial/weak spread (instead of
    nearly everything landing in "good" by chance), the number of "none"
    courses per university is chosen to hit a target tier on purpose."""
    unis, courses, matches = [], [], []
    tier_cycle = ["good", "good", "partial", "weak"]  # ~50% good, 25% partial, 25% weak
    none_counts_for_tier = {"good": [0, 1], "partial": [3, 4], "weak": [5, 6]}
    sublabel_cycle = ["good", "partial"]  # cosmetic split for courses that do have a partner
    for i in range(count):
        country, code, lat0, lng0, lang = _DEMO_COUNTRIES[i % len(_DEMO_COUNTRIES)]
        uid = f"demo-{code.lower()}-{i + 1}"
        ring = i // len(_DEMO_COUNTRIES)  # spreads repeats of a country apart on the map
        lat = round(lat0 + ((i % 3) - 1) * 0.5 + ring * 0.7, 2)
        lng = round(lng0 + ((i % 5) - 2) * 0.6, 2)
        city = _demo_pick(_DEMO_CITY_PREFIXES, uid, "prefix") + " " + _demo_pick(_DEMO_CITY_ROOTS, uid, "root").capitalize()
        name = f"{city} {_demo_pick(_DEMO_NAME_PATTERNS, uid, 'name')} (fictional - demo only)"
        unis.append({
            "id": uid, "name": name, "city": city, "country": country, "country_code": code,
            "lat": lat, "lng": lng, "languages": [lang] if lang == "English" else [lang, "English"],
            "website": f"https://example.com/{uid}", "greeting": "Safe travels!",
        })

        target_tier = tier_cycle[i % len(tier_cycle)]
        none_n = _demo_pick(none_counts_for_tier[target_tier], uid, "nonecount")
        ordered = sorted(HOME_COURSES, key=lambda hc: _hashlib.md5(f"{uid}-{hc['id']}".encode()).hexdigest())
        none_ids = {hc["id"] for hc in ordered[:none_n]}

        for hc in HOME_COURSES:
            label = "none" if hc["id"] in none_ids else _demo_pick(sublabel_cycle, uid, hc["id"])
            pcid = f"{uid}-{hc['id']}"
            if label != "none":
                courses.append({
                    "id": pcid, "university_id": uid, "name": f"{hc['name']} (Demo)",
                    "ects": hc["ects"], "semester": 2, "language": lang if i % 2 == 0 else "English",
                    "description": f"Fictional demo course standing in for {hc['name']}.",
                })
            missing = [] if label == "good" else (hc["topics"][:2] if label == "partial" else hc["topics"])
            matches.append({
                "university_id": uid, "home_course_id": hc["id"],
                "partner_course_id": pcid if label != "none" else None,
                "label": label,
                "explanation": "Fictional demo match - filler data, not a real course comparison.",
                "missing_topics": missing,
            })
    return unis, courses, matches


TEMP_UNIVERSITIES, TEMP_PARTNER_COURSES, TEMP_MATCHES = _generate_fictional_universities()
# ========================================================== end temporary block

MATCHES = [
    # St. Pölten
    {"university_id": "stpolten", "home_course_id": "ac-ai", "partner_course_id": "stp-ai", "label": "good", "explanation": "Both cover machine learning fundamentals; UPT adds neural network depth.", "missing_topics": ["ethics"]},
    {"university_id": "stpolten", "home_course_id": "ac-os", "partner_course_id": "stp-osd", "label": "good", "explanation": "Processes, signals and scheduling align; memory management is shorter abroad.", "missing_topics": ["file systems"]},
    {"university_id": "stpolten", "home_course_id": "ac-net", "partner_course_id": "stp-net", "label": "good", "explanation": "Same TCP/IP and routing core with a shared security module."},
    {"university_id": "stpolten", "home_course_id": "ac-comp", "partner_course_id": None, "label": "none", "explanation": "Closest is Media Informatics, but no compiler construction is taught. Take it at UPT after return.", "missing_topics": ["lexical analysis", "semantic analysis", "code generation"]},
    {"university_id": "stpolten", "home_course_id": "ac-db", "partner_course_id": "stp-db", "label": "good", "explanation": "Identical relational modelling and transaction topics.", "missing_topics": []},
    {"university_id": "stpolten", "home_course_id": "ac-se", "partner_course_id": "stp-se", "label": "partial", "explanation": "Agile and testing overlap; partner course has less version control practice.", "missing_topics": ["version control"]},
    # Setúbal
    {"university_id": "setubal", "home_course_id": "ac-ai", "partner_course_id": "set-ai", "label": "good", "explanation": "Same AI core: search, knowledge representation and machine learning."},
    {"university_id": "setubal", "home_course_id": "ac-os", "partner_course_id": "set-sop", "label": "good", "explanation": "Full overlap on processes, threads, scheduling and memory."},
    {"university_id": "setubal", "home_course_id": "ac-net", "partner_course_id": "set-red", "label": "good", "explanation": "Layered networks, TCP/IP and sockets match one to one."},
    {"university_id": "setubal", "home_course_id": "ac-comp", "partner_course_id": "set-comp", "label": "partial", "explanation": "Covers syntax, parsing and translation, but no code generation for compilers.", "missing_topics": ["code generation"]},
    {"university_id": "setubal", "home_course_id": "ac-db", "partner_course_id": "set-bd", "label": "good", "explanation": "Relational calculus, SQL and transactions align; indexing included."},
    {"university_id": "setubal", "home_course_id": "ac-se", "partner_course_id": "set-es", "label": "good", "explanation": "Requirements, agile process, testing and patterns all match."},
    # Leuven
    {"university_id": "leuven", "home_course_id": "ac-ai", "partner_course_id": "ucll-ai", "label": "good", "explanation": "Machine learning pipelines plus neural networks; ethics is extra abroad.", "missing_topics": []},
    {"university_id": "leuven", "home_course_id": "ac-os", "partner_course_id": "ucll-sys", "label": "partial", "explanation": "Linux internals and scheduling overlap; file system theory is lighter.", "missing_topics": ["file systems"]},
    {"university_id": "leuven", "home_course_id": "ac-net", "partner_course_id": "ucll-net", "label": "good", "explanation": "TCP/IP, switching and routing plus service configuration."},
    {"university_id": "leuven", "home_course_id": "ac-comp", "partner_course_id": "ucll-pl", "label": "partial", "explanation": "Syntax, semantics and interpreters overlap; no parsing practice on real compilers.", "missing_topics": ["semantic analysis"]},
    {"university_id": "leuven", "home_course_id": "ac-db", "partner_course_id": "ucll-db", "label": "good", "explanation": "SQL, transactions and data modelling covered; normalization shorter.", "missing_topics": ["normalization"]},
    {"university_id": "leuven", "home_course_id": "ac-se", "partner_course_id": "ucll-se", "label": "good", "explanation": "Team project with agile process, testing included."},
    # Vidzeme
    {"university_id": "vidzeme", "home_course_id": "ac-ai", "partner_course_id": "vid-ml", "label": "partial", "explanation": "Data science covers machine learning basics but skips search and CSPs.", "missing_topics": ["search", "constraint satisfaction"]},
    {"university_id": "vidzeme", "home_course_id": "ac-os", "partner_course_id": "vid-os", "label": "partial", "explanation": "Computer architecture plus OS basics; less depth on scheduling.", "missing_topics": ["threads", "scheduling"]},
    {"university_id": "vidzeme", "home_course_id": "ac-net", "partner_course_id": "vid-net", "label": "partial", "explanation": "Web technologies cover HTTP and APIs; routing and sockets are shallow.", "missing_topics": ["routing", "sockets"]},
    {"university_id": "vidzeme", "home_course_id": "ac-comp", "partner_course_id": "vid-prog", "label": "partial", "explanation": "Paradigms and compiler overview; no full compiler project.", "missing_topics": ["semantic analysis", "code generation"]},
    {"university_id": "vidzeme", "home_course_id": "ac-db", "partner_course_id": None, "label": "none", "explanation": "No relational databases course this semester. Take it at UPT after return.", "missing_topics": ["SQL", "transactions", "indexing"]},
    {"university_id": "vidzeme", "home_course_id": "ac-se", "partner_course_id": "vid-se", "label": "good", "explanation": "Lifecycle, testing and teamwork match the UPT course."},
    # Saxion
    {"university_id": "saxion", "home_course_id": "ac-ai", "partner_course_id": "sax-ds", "label": "partial", "explanation": "Data science covers machine learning and model evaluation, but search and constraint satisfaction are not taught.", "missing_topics": ["search", "constraint satisfaction"]},
    {"university_id": "saxion", "home_course_id": "ac-os", "partner_course_id": "sax-os", "label": "good", "explanation": "Processes, scheduling and memory management match; Linux practice is a bonus."},
    {"university_id": "saxion", "home_course_id": "ac-net", "partner_course_id": "sax-net", "label": "good", "explanation": "TCP/IP, routing and sockets match one to one."},
    {"university_id": "saxion", "home_course_id": "ac-comp", "partner_course_id": None, "label": "none", "explanation": "No compiler construction course this semester. Take it at UPT after return.", "missing_topics": ["lexical analysis", "parsing", "code generation"]},
    {"university_id": "saxion", "home_course_id": "ac-db", "partner_course_id": "sax-db", "label": "good", "explanation": "Relational modelling, SQL and transactions align."},
    {"university_id": "saxion", "home_course_id": "ac-se", "partner_course_id": "sax-se", "label": "good", "explanation": "Testing, design patterns and requirements overlap fully."},
    # Hochschule Fulda
    {"university_id": "fulda", "home_course_id": "ac-ai", "partner_course_id": "ful-is", "label": "good", "explanation": "Search, reasoning and machine learning match; ethics is shorter abroad.", "missing_topics": ["ethics"]},
    {"university_id": "fulda", "home_course_id": "ac-os", "partner_course_id": "ful-os", "label": "good", "explanation": "Processes, threads, scheduling, memory and file systems all match."},
    {"university_id": "fulda", "home_course_id": "ac-net", "partner_course_id": "ful-net", "label": "good", "explanation": "Layered networks, routing and sockets match; wireless and security are extra."},
    {"university_id": "fulda", "home_course_id": "ac-comp", "partner_course_id": "ful-fl", "label": "partial", "explanation": "Grammars, automata and parsing overlap; no code generation.", "missing_topics": ["semantic analysis", "code generation"]},
    {"university_id": "fulda", "home_course_id": "ac-db", "partner_course_id": "ful-db", "label": "good", "explanation": "Relational model, SQL and transactions match; indexing is shorter.", "missing_topics": ["indexing"]},
    {"university_id": "fulda", "home_course_id": "ac-se", "partner_course_id": "ful-spo", "label": "partial", "explanation": "Agile and teamwork overlap; testing and version control are lighter.", "missing_topics": ["testing", "version control"]},
    # JAMK
    {"university_id": "jamk", "home_course_id": "ac-ai", "partner_course_id": "jam-ml", "label": "partial", "explanation": "Machine learning and neural network basics match; search and constraint satisfaction are missing.", "missing_topics": ["search", "constraint satisfaction"]},
    {"university_id": "jamk", "home_course_id": "ac-os", "partner_course_id": "jam-lin", "label": "partial", "explanation": "Linux processes and file systems overlap; scheduling theory is light.", "missing_topics": ["scheduling"]},
    {"university_id": "jamk", "home_course_id": "ac-net", "partner_course_id": "jam-net", "label": "good", "explanation": "TCP/IP, routing and network security match."},
    {"university_id": "jamk", "home_course_id": "ac-comp", "partner_course_id": None, "label": "none", "explanation": "No compiler course at JAMK. Take it at UPT after return.", "missing_topics": ["lexical analysis", "parsing", "code generation"]},
    {"university_id": "jamk", "home_course_id": "ac-db", "partner_course_id": "jam-db", "label": "good", "explanation": "Relational design, SQL, normalization and indexing match."},
    {"university_id": "jamk", "home_course_id": "ac-se", "partner_course_id": "jam-sdm", "label": "good", "explanation": "Agile process, testing, version control and patterns all match."},
    # MATE
    {"university_id": "mate", "home_course_id": "ac-ai", "partner_course_id": "mat-ida", "label": "partial", "explanation": "Machine learning on real data overlaps; search and neural networks are not covered.", "missing_topics": ["search", "neural networks"]},
    {"university_id": "mate", "home_course_id": "ac-os", "partner_course_id": None, "label": "none", "explanation": "No operating systems course this semester. Take it at UPT after return.", "missing_topics": ["processes", "scheduling", "memory management"]},
    {"university_id": "mate", "home_course_id": "ac-net", "partner_course_id": "mat-net", "label": "partial", "explanation": "TCP/IP and network security overlap; routing and sockets are shallow.", "missing_topics": ["routing", "sockets"]},
    {"university_id": "mate", "home_course_id": "ac-comp", "partner_course_id": None, "label": "none", "explanation": "No compiler course. Take it at UPT after return.", "missing_topics": ["lexical analysis", "parsing", "code generation"]},
    {"university_id": "mate", "home_course_id": "ac-db", "partner_course_id": "mat-gis", "label": "partial", "explanation": "SQL and database design match; transactions are light.", "missing_topics": ["transactions"]},
    {"university_id": "mate", "home_course_id": "ac-se", "partner_course_id": "mat-web", "label": "partial", "explanation": "Version control overlaps; testing and design patterns are not covered.", "missing_topics": ["testing", "design patterns"]},
]

# Timeline template: offsets in days relative to start (S), arrival (A), end (E).
TIMELINE_TEMPLATE = [
    {"title": "Get the EHIC card", "stage": "before", "anchor": "S", "offset": -30},
    {"title": "Sign the Learning Agreement", "stage": "before", "anchor": "S", "offset": -21},
    {"title": "Book travel tickets", "stage": "before", "anchor": "S", "offset": -14},
    {"title": "Confirm accommodation", "stage": "before", "anchor": "S", "offset": -10},
    {"title": "Sign the grant contract", "stage": "before", "anchor": "S", "offset": -7},
    {"title": "Confirm arrival at the university", "stage": "arrival", "anchor": "A", "offset": 0},
    {"title": "Buy a local transit pass", "stage": "arrival", "anchor": "A", "offset": 3},
    {"title": "Register your residence", "stage": "arrival", "anchor": "A", "offset": 7},
    {"title": "Open a local bank account", "stage": "arrival", "anchor": "A", "offset": 7},
    {"title": "Send arrival confirmation to UPT", "stage": "during", "anchor": "A", "offset": 10},
    {"title": "Mid-term check-in with coordinator", "stage": "during", "anchor": "A", "offset": 45},
    {"title": "Collect the Letter of Confirmation", "stage": "before-return", "anchor": "E", "offset": -14},
    {"title": "Request the Transcript of Records", "stage": "before-return", "anchor": "E", "offset": -5},
    {"title": "Submit documents to the Erasmus office", "stage": "after-return", "anchor": "E", "offset": 10},
    {"title": "Finish the recognition of credits", "stage": "after-return", "anchor": "E", "offset": 30},
]

STAGES = ["before", "arrival", "during", "before-return", "after-return"]
STAGE_LABELS = {
    "before": "Before departure",
    "arrival": "Arrival (first 2 weeks)",
    "during": "During",
    "before-return": "Before return",
    "after-return": "After return",
}

WELCOME_DOC = {
    "document_type": "Rental contract",
    "language": "Portuguese",
    "summary": "Residential lease for a furnished room near the university.",
    "result": {
        "what": "This is a residential rental contract for your room in Setúbal.",
        "steps": [
            "Write down the monthly rent and the deposit amount.",
            "Do not pay the deposit before viewing a signed copy.",
            "Check which utilities (water, electricity, internet) are included.",
            "Keep one signed copy for your records - banks often ask for it.",
        ],
        "deadlines": [
            {"text": "First rent payment is due on the 5th of the month", "offset_days": 5, "title": "Pay first rent"},
        ],
        "bring": ["Passport or ID", "NIF (Portuguese tax number)", "Proof of enrolment"],
        "watch_out": "Late rent payments carry a surcharge of 20 EUR per day of delay.",
        "keywords": [["Senhorio", "landlord"], ["Caução", "deposit"], ["Renda", "rent"], ["Fiador", "guarantor"]],
    },
}


def seed():
    """Insert whatever is missing. Safe to run on every start: rows that already
    exist are left alone, except the website/greeting of a university, which are
    refreshed so a corrected link reaches old databases. Returns True when
    anything was added."""
    init_db()
    with db() as conn:
        def rows():
            return sum(conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                       for t in ("home_courses", "universities", "partner_courses", "matches"))
        before = rows()
        conn.executemany(
            "INSERT OR IGNORE INTO home_courses (id, program, semester, name, ects, topics, type) VALUES (?,?,?,?,?,?,?)",
            [(c["id"], PROGRAM, 2, c["name"], c["ects"], j(c["topics"]), c["type"]) for c in HOME_COURSES],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO universities (id, name, city, country, country_code, lat, lng, languages, website, greeting) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(u["id"], u["name"], u["city"], u["country"], u["country_code"], u["lat"], u["lng"], j(u["languages"]), u["website"], u["greeting"]) for u in UNIVERSITIES + TEMP_UNIVERSITIES],
        )
        conn.executemany(
            "UPDATE universities SET website = ?, greeting = ? WHERE id = ?",
            [(u["website"], u["greeting"], u["id"]) for u in UNIVERSITIES + TEMP_UNIVERSITIES],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO partner_courses (id, university_id, name, ects, semester, language, description) VALUES (?,?,?,?,?,?,?)",
            [(c["id"], c["university_id"], c["name"], c["ects"], c["semester"], c["language"], c["description"]) for c in PARTNER_COURSES + TEMP_PARTNER_COURSES],
        )
        conn.executemany(
            "INSERT OR IGNORE INTO matches (program, university_id, home_course_id, partner_course_id, label, explanation, missing_topics) VALUES (?,?,?,?,?,?,?)",
            [(PROGRAM, m["university_id"], m["home_course_id"], m["partner_course_id"], m["label"], m["explanation"], j(m.get("missing_topics", []))) for m in MATCHES + TEMP_MATCHES],
        )
        return rows() > before


# Project paperwork deadlines: months before the mobility start date.
# Served by /api/deadlines and filtered client-side by the types the user
# picked during onboarding.
PROJECT_DEADLINES = [
    {"type": "Semester exchange", "title": "Nomination sent by your faculty", "months_before": 5,
     "note": "Your coordinator nominates you at the partner university."},
    {"type": "Semester exchange", "title": "Accommodation applications", "months_before": 4,
     "note": "Dormitories and partner housing portals open around this time."},
    {"type": "Semester exchange", "title": "Learning Agreement - first signature", "months_before": 3,
     "note": "Signed by you, UPT coordinator, partner coordinator."},
    {"type": "Semester exchange", "title": "Grant contract signing", "months_before": 2,
     "note": "Bring your bank details (IBAN) to the international office."},
    {"type": "Semester exchange", "title": "Enrolment / registration at the host", "months_before": 1,
     "note": "Complete the partner university online registration."},
    {"type": "Summer school", "title": "Application submission", "months_before": 3,
     "note": "Transcript and motivation letter are usually required."},
    {"type": "Summer school", "title": "Tuition deposit", "months_before": 2,
     "note": "Non-refundable in most programmes - check the cancellation policy."},
    {"type": "Summer school", "title": "Final payment", "months_before": 1,
     "note": "Full tuition and accommodation are due before arrival."},
    {"type": "Research stay", "title": "Host agreement / invitation letter", "months_before": 3,
     "note": "Required by the international office before funding."},
    {"type": "Research stay", "title": "Work plan approved by both supervisors", "months_before": 2,
     "note": "Defines the scope and credit conversion of your stay."},
    {"type": "Sports programme", "title": "Registration window", "months_before": 2,
     "note": "Erasmus+ sport events fill up fast - register early."},
    {"type": "Sports programme", "title": "Medical certificate", "months_before": 1,
     "note": "Standard fitness declaration for competitive events."},
]
