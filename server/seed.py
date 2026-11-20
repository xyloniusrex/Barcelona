"""Seed data for the PoliGo prototype.

Partner universities follow the E3UDRES2 shortlist from the app spec.
Matches are precomputed once and stored, so the demo is instant and
deterministic; on-the-fly matching plugs in later (run_matching.py hook).
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
    {"id": "stpolten", "name": "St. Pölten University of Applied Sciences", "city": "St. Pölten", "country": "Austria", "country_code": "AT", "lat": 48.20, "lng": 15.63, "languages": ["German", "English"], "website": "https://www.fhstp.ac.at", "greeting": "Gute Reise!"},
    {"id": "setubal", "name": "Instituto Politécnico de Setúbal", "city": "Setúbal", "country": "Portugal", "country_code": "PT", "lat": 38.52, "lng": -8.89, "languages": ["Portuguese", "English"], "website": "https://www.ips.pt", "greeting": "Boa viagem!"},
    {"id": "leuven", "name": "UC Leuven-Limburg", "city": "Leuven", "country": "Belgium", "country_code": "BE", "lat": 50.88, "lng": 4.70, "languages": ["English", "Dutch"], "website": "https://www.ucll.be", "greeting": "Goede reis!"},
    {"id": "vidzeme", "name": "Vidzeme University of Applied Sciences", "city": "Valmiera", "country": "Latvia", "country_code": "LV", "lat": 57.54, "lng": 25.43, "languages": ["English", "Latvian"], "website": "https://www.vsaa.lv", "greeting": "Laimīgu ceļu!"},
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
]

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
    init_db()
    with db() as conn:
        if conn.execute("SELECT COUNT(*) FROM universities").fetchone()[0]:
            return False
        conn.executemany(
            "INSERT INTO home_courses (id, program, semester, name, ects, topics, type) VALUES (?,?,?,?,?,?,?)",
            [(c["id"], PROGRAM, 2, c["name"], c["ects"], j(c["topics"]), c["type"]) for c in HOME_COURSES],
        )
        conn.executemany(
            "INSERT INTO universities (id, name, city, country, country_code, lat, lng, languages, website, greeting) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(u["id"], u["name"], u["city"], u["country"], u["country_code"], u["lat"], u["lng"], j(u["languages"]), u["website"], u["greeting"]) for u in UNIVERSITIES],
        )
        conn.executemany(
            "INSERT INTO partner_courses (id, university_id, name, ects, semester, language, description) VALUES (?,?,?,?,?,?,?)",
            [(c["id"], c["university_id"], c["name"], c["ects"], c["semester"], c["language"], c["description"]) for c in PARTNER_COURSES],
        )
        conn.executemany(
            "INSERT INTO matches (program, university_id, home_course_id, partner_course_id, label, explanation, missing_topics) VALUES (?,?,?,?,?,?,?)",
            [(PROGRAM, m["university_id"], m["home_course_id"], m["partner_course_id"], m["label"], m["explanation"], j(m.get("missing_topics", []))) for m in MATCHES],
        )
    return True
