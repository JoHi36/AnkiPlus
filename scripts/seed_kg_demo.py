#!/usr/bin/env python3
"""Seed the Knowledge Graph with curated medical terms for UI demo.

Run from anywhere:
    python3 scripts/seed_kg_demo.py

Creates ~200 nodes grouped by 5 subjects with ~400 meaningful edges.
"""

import sqlite3
import os
import sys
import random

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ADDON_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ADDON_ROOT)

DB_PATH = os.path.join(ADDON_ROOT, "storage", "card_sessions.db")

# ---------------------------------------------------------------------------
# Terms by subject (deck_id)
# ---------------------------------------------------------------------------

SUBJECTS = {
    1: {
        "name": "Anatomie",
        "terms": [
            "Femur", "Tibia", "Fibula", "Humerus", "Radius", "Ulna",
            "Scapula", "Clavicula", "Pelvis", "Sternum", "Vertebra",
            "Cranium", "Mandibula", "Os temporale", "Os sphenoidale",
            "Aorta", "Vena cava", "Arteria carotis", "Arteria femoralis",
            "Vena jugularis", "Arteria renalis", "Truncus coeliacus",
            "Arteria mesenterica", "Plexus brachialis", "Nervus medianus",
            "Nervus ulnaris", "Nervus radialis", "Nervus vagus",
            "Nervus phrenicus", "Nervus ischiadicus", "Diaphragma",
            "Musculus deltoideus", "Musculus biceps", "Musculus quadriceps",
            "Peritoneum", "Mediastinum", "Retroperitoneum", "Larynx",
            "Pharynx", "Trachea",
        ],
    },
    2: {
        "name": "Biochemie",
        "terms": [
            "Glykolyse", "Citratzyklus", "Atmungskette", "Gluconeogenese",
            "Glykogensynthese", "Glykogenolyse", "Fettsäuresynthese",
            "Beta-Oxidation", "Harnstoffzyklus", "Pentosephosphatweg",
            "Kollagen", "Prolin", "Hydroxyprolin", "Vitamin C",
            "Aminosäuren", "Proteinbiosynthese", "Translation",
            "Transkription", "Replikation", "ATP", "ADP", "NADH", "FADH2",
            "Acetyl-CoA", "Pyruvat", "Oxalacetat", "Citrat", "Succinat",
            "Enzym", "Substrat", "Inhibitor", "Allosterie",
            "Michaelis-Menten", "Km-Wert", "Phosphorylierung",
            "Dephosphorylierung", "Kinase", "Phosphatase", "Coenzym",
            "Cofaktor",
        ],
    },
    3: {
        "name": "Histologie",
        "terms": [
            "Epithel", "Endothel", "Bindegewebe", "Knorpel", "Knochen",
            "Osteoblasten", "Osteoklasten", "Osteozyten", "Chondrozyten",
            "Fibroblasten", "Kollagenfasern", "Elastin", "Lamina basalis",
            "Basalmembran", "Tight Junction", "Gap Junction", "Desmosom",
            "Osteogenesis imperfecta", "Ossifikation",
            "Enchondrale Ossifikation", "Desmale Ossifikation",
            "Havers-Kanal", "Volkmann-Kanal", "Periost", "Endost",
            "Epiphysenfuge", "Wachstumsfuge", "Hämatopoese", "Erythropoese",
            "Granulopoese",
        ],
    },
    4: {
        "name": "Physiologie",
        "terms": [
            "Aktionspotential", "Ruhemembranpotential", "Nernst-Gleichung",
            "Goldman-Gleichung", "Na/K-ATPase", "Depolarisation",
            "Repolarisation", "Hyperpolarisation", "Refraktärzeit",
            "Erregungsleitung", "Synapse", "Neurotransmitter", "Acetylcholin",
            "Noradrenalin", "Serotonin", "Dopamin", "GABA", "Glutamat",
            "Herzminutenvolumen", "Schlagvolumen", "Ejektionsfraktion",
            "Frank-Starling", "Blutdruck", "Herzzeitvolumen", "GFR", "Renin",
            "Angiotensin", "Aldosteron", "ADH", "Filtration", "Reabsorption",
            "Sekretion", "Clearance", "Atemminutenvolumen", "Vitalkapazität",
            "Residualvolumen", "Compliance", "Surfactant", "Gasaustausch",
            "Hämoglobin",
        ],
    },
    5: {
        "name": "Chemie",
        "terms": [
            "pH-Wert", "Henderson-Hasselbalch", "Puffersystem", "Bicarbonat",
            "Redoxreaktion", "Oxidation", "Reduktion", "Osmose",
            "Osmolarität", "Diffusion", "Ionenbindung", "Kovalente Bindung",
            "Wasserstoffbrücke", "Van-der-Waals", "Säure", "Base",
            "Elektrolyt", "Gleichgewichtskonstante", "Gibbs-Energie",
            "Enthalpie", "Entropie",
        ],
    },
}

# ---------------------------------------------------------------------------
# Cross-subject edges (high-weight, most interesting connections)
# ---------------------------------------------------------------------------

CROSS_EDGES = [
    # Kollagen hub
    ("Kollagen", "Prolin", 8),
    ("Kollagen", "Vitamin C", 7),
    ("Kollagen", "Osteogenesis imperfecta", 9),
    ("Kollagen", "Bindegewebe", 7),
    ("Kollagen", "Fibroblasten", 6),
    ("Kollagen", "Kollagenfasern", 10),
    ("Kollagen", "Ossifikation", 5),
    ("Kollagen", "Hydroxyprolin", 8),

    # Glykolyse hub
    ("Glykolyse", "Pyruvat", 10),
    ("Glykolyse", "ATP", 9),
    ("Glykolyse", "NADH", 7),
    ("Glykolyse", "Gluconeogenese", 8),
    ("Glykolyse", "Citratzyklus", 9),

    # Citratzyklus hub
    ("Citratzyklus", "Acetyl-CoA", 10),
    ("Citratzyklus", "Oxalacetat", 9),
    ("Citratzyklus", "NADH", 8),
    ("Citratzyklus", "FADH2", 7),
    ("Citratzyklus", "Atmungskette", 9),
    ("Citratzyklus", "Succinat", 7),
    ("Citratzyklus", "Citrat", 8),

    # Aktionspotential hub
    ("Aktionspotential", "Na/K-ATPase", 9),
    ("Aktionspotential", "Depolarisation", 10),
    ("Aktionspotential", "Repolarisation", 10),
    ("Aktionspotential", "Nernst-Gleichung", 7),
    ("Aktionspotential", "Ruhemembranpotential", 9),

    # Na/K-ATPase cross-links
    ("Na/K-ATPase", "ATP", 8),
    ("Na/K-ATPase", "Nernst-Gleichung", 6),
    ("Na/K-ATPase", "Ruhemembranpotential", 8),

    # pH hub
    ("pH-Wert", "Henderson-Hasselbalch", 10),
    ("pH-Wert", "Puffersystem", 9),
    ("pH-Wert", "Bicarbonat", 8),

    # Nernst cross-links
    ("Nernst-Gleichung", "Goldman-Gleichung", 8),
    ("Nernst-Gleichung", "Ruhemembranpotential", 9),
    ("Nernst-Gleichung", "pH-Wert", 5),

    # Osteoblasten hub
    ("Osteoblasten", "Osteoklasten", 9),
    ("Osteoblasten", "Ossifikation", 8),
    ("Osteoblasten", "Knochen", 9),
    ("Osteoblasten", "Periost", 6),

    # GFR hub
    ("GFR", "Renin", 8),
    ("GFR", "Angiotensin", 7),
    ("GFR", "Aldosteron", 7),
    ("GFR", "Filtration", 9),
    ("GFR", "Clearance", 8),

    # Hämoglobin cross-links
    ("Hämoglobin", "Gasaustausch", 9),
    ("Hämoglobin", "Erythropoese", 8),

    # Epithel hub
    ("Epithel", "Tight Junction", 8),
    ("Epithel", "Gap Junction", 7),
    ("Epithel", "Desmosom", 7),
    ("Epithel", "Basalmembran", 8),
    ("Epithel", "Lamina basalis", 8),

    # Atmungskette cross-links
    ("Atmungskette", "NADH", 9),
    ("Atmungskette", "FADH2", 8),
    ("Atmungskette", "ATP", 10),

    # Proteinbiosynthese hub
    ("Proteinbiosynthese", "Translation", 10),
    ("Proteinbiosynthese", "Transkription", 9),
    ("Proteinbiosynthese", "Aminosäuren", 8),
    ("Proteinbiosynthese", "Replikation", 6),

    # Herzminutenvolumen hub
    ("Herzminutenvolumen", "Schlagvolumen", 10),
    ("Herzminutenvolumen", "Frank-Starling", 8),
    ("Herzminutenvolumen", "Blutdruck", 7),
    ("Herzminutenvolumen", "Ejektionsfraktion", 8),

    # Additional cross-subject connections
    ("Pyruvat", "Acetyl-CoA", 9),
    ("Pyruvat", "Gluconeogenese", 7),
    ("ATP", "ADP", 10),
    ("ATP", "Phosphorylierung", 7),
    ("Phosphorylierung", "Kinase", 8),
    ("Dephosphorylierung", "Phosphatase", 8),
    ("Phosphorylierung", "Dephosphorylierung", 7),
    ("Synapse", "Neurotransmitter", 10),
    ("Neurotransmitter", "Acetylcholin", 8),
    ("Neurotransmitter", "Noradrenalin", 7),
    ("Neurotransmitter", "Serotonin", 7),
    ("Neurotransmitter", "Dopamin", 7),
    ("Neurotransmitter", "GABA", 7),
    ("Neurotransmitter", "Glutamat", 7),
    ("Renin", "Angiotensin", 10),
    ("Angiotensin", "Aldosteron", 9),
    ("Aldosteron", "ADH", 6),
    ("Filtration", "Reabsorption", 8),
    ("Reabsorption", "Sekretion", 7),
    ("Aorta", "Vena cava", 7),
    ("Aorta", "Arteria carotis", 6),
    ("Arteria renalis", "GFR", 7),
    ("Nervus vagus", "Herzminutenvolumen", 5),
    ("Diaphragma", "Nervus phrenicus", 8),
    ("Larynx", "Pharynx", 7),
    ("Pharynx", "Trachea", 7),
    ("Trachea", "Larynx", 6),
    ("Surfactant", "Compliance", 7),
    ("Gasaustausch", "Atemminutenvolumen", 6),
    ("Vitalkapazität", "Residualvolumen", 8),
    ("Atemminutenvolumen", "Vitalkapazität", 6),
    ("Ossifikation", "Enchondrale Ossifikation", 9),
    ("Ossifikation", "Desmale Ossifikation", 9),
    ("Ossifikation", "Knochen", 8),
    ("Knochen", "Knorpel", 6),
    ("Knochen", "Periost", 7),
    ("Knochen", "Endost", 6),
    ("Havers-Kanal", "Volkmann-Kanal", 8),
    ("Havers-Kanal", "Knochen", 7),
    ("Epiphysenfuge", "Wachstumsfuge", 10),
    ("Epiphysenfuge", "Enchondrale Ossifikation", 7),
    ("Hämatopoese", "Erythropoese", 9),
    ("Hämatopoese", "Granulopoese", 8),
    ("Bindegewebe", "Elastin", 6),
    ("Bindegewebe", "Fibroblasten", 7),
    ("Basalmembran", "Lamina basalis", 10),
    ("Osteoklasten", "Osteozyten", 6),
    ("Osteoblasten", "Osteozyten", 7),
    ("Chondrozyten", "Knorpel", 9),
    ("Enzym", "Substrat", 9),
    ("Enzym", "Inhibitor", 8),
    ("Enzym", "Allosterie", 7),
    ("Enzym", "Michaelis-Menten", 8),
    ("Michaelis-Menten", "Km-Wert", 10),
    ("Enzym", "Coenzym", 7),
    ("Coenzym", "Cofaktor", 8),
    ("Glykogensynthese", "Glykogenolyse", 8),
    ("Fettsäuresynthese", "Beta-Oxidation", 8),
    ("Beta-Oxidation", "Acetyl-CoA", 7),
    ("Harnstoffzyklus", "Aminosäuren", 7),
    ("Pentosephosphatweg", "NADH", 5),
    ("Prolin", "Hydroxyprolin", 9),
    ("Hydroxyprolin", "Vitamin C", 8),
    ("Redoxreaktion", "Oxidation", 10),
    ("Redoxreaktion", "Reduktion", 10),
    ("Osmose", "Osmolarität", 9),
    ("Osmose", "Diffusion", 7),
    ("Ionenbindung", "Kovalente Bindung", 6),
    ("Wasserstoffbrücke", "Van-der-Waals", 5),
    ("Säure", "Base", 10),
    ("Säure", "pH-Wert", 8),
    ("Gibbs-Energie", "Enthalpie", 9),
    ("Gibbs-Energie", "Entropie", 9),
    ("Enthalpie", "Entropie", 7),
    ("Depolarisation", "Repolarisation", 9),
    ("Repolarisation", "Hyperpolarisation", 7),
    ("Hyperpolarisation", "Refraktärzeit", 6),
    ("Erregungsleitung", "Synapse", 7),
    ("Erregungsleitung", "Aktionspotential", 8),
    ("Blutdruck", "Herzzeitvolumen", 8),
    ("Frank-Starling", "Schlagvolumen", 8),
    ("Ejektionsfraktion", "Schlagvolumen", 9),
    ("Endothel", "Epithel", 6),
    ("Endothel", "Aorta", 5),
    ("ADH", "Osmose", 6),
    ("ADH", "Reabsorption", 7),
    ("Aldosteron", "Reabsorption", 6),
    ("Aldosteron", "Na/K-ATPase", 5),
    ("Osmose", "Filtration", 5),
    ("Oxidation", "Atmungskette", 5),
    ("Reduktion", "NADH", 5),
    ("Elektrolyt", "Ionenbindung", 5),
    ("Hämoglobin", "pH-Wert", 5),
    ("Bicarbonat", "Hämoglobin", 5),
    ("Puffersystem", "Bicarbonat", 7),
    ("Gleichgewichtskonstante", "Enzym", 5),
    ("Diffusion", "Gasaustausch", 6),
]

# ---------------------------------------------------------------------------
# Within-subject neighbor edges (generated for all pairs within small groups)
# ---------------------------------------------------------------------------

WITHIN_SUBJECT_GROUPS = {
    1: [  # Anatomie
        ["Femur", "Tibia", "Fibula"],
        ["Humerus", "Radius", "Ulna"],
        ["Scapula", "Clavicula", "Sternum"],
        ["Cranium", "Mandibula", "Os temporale", "Os sphenoidale"],
        ["Aorta", "Vena cava", "Arteria carotis", "Arteria femoralis", "Vena jugularis"],
        ["Arteria renalis", "Truncus coeliacus", "Arteria mesenterica", "Aorta"],
        ["Plexus brachialis", "Nervus medianus", "Nervus ulnaris", "Nervus radialis"],
        ["Nervus vagus", "Nervus phrenicus", "Nervus ischiadicus"],
        ["Musculus deltoideus", "Musculus biceps", "Musculus quadriceps"],
        ["Peritoneum", "Mediastinum", "Retroperitoneum"],
        ["Pelvis", "Vertebra", "Sternum"],
        # Additional anatomical groupings for more edges
        ["Femur", "Pelvis", "Musculus quadriceps"],
        ["Humerus", "Scapula", "Musculus deltoideus", "Musculus biceps"],
        ["Tibia", "Fibula", "Femur", "Pelvis"],
        ["Arteria carotis", "Vena jugularis", "Cranium"],
        ["Arteria femoralis", "Femur", "Vena cava"],
        ["Trachea", "Mediastinum", "Aorta"],
        ["Larynx", "Trachea", "Nervus vagus"],
        ["Sternum", "Mediastinum", "Aorta"],
        ["Nervus medianus", "Nervus ulnaris", "Humerus"],
        ["Nervus ischiadicus", "Pelvis", "Femur"],
        ["Vertebra", "Cranium", "Nervus vagus"],
        ["Diaphragma", "Peritoneum", "Mediastinum"],
        ["Radius", "Ulna", "Nervus radialis"],
    ],
    2: [  # Biochemie
        ["Glykolyse", "Gluconeogenese", "Pentosephosphatweg"],
        ["Glykogensynthese", "Glykogenolyse"],
        ["Fettsäuresynthese", "Beta-Oxidation"],
        ["ATP", "ADP", "NADH", "FADH2"],
        ["Acetyl-CoA", "Pyruvat", "Oxalacetat", "Citrat", "Succinat"],
        ["Enzym", "Substrat", "Inhibitor", "Allosterie"],
        ["Phosphorylierung", "Dephosphorylierung", "Kinase", "Phosphatase"],
        ["Coenzym", "Cofaktor"],
        ["Translation", "Transkription", "Replikation"],
        ["Kollagen", "Prolin", "Hydroxyprolin", "Vitamin C"],
        # Additional biochemistry groupings
        ["Michaelis-Menten", "Km-Wert", "Enzym", "Substrat"],
        ["Aminosäuren", "Proteinbiosynthese", "Translation"],
        ["Harnstoffzyklus", "Aminosäuren", "Citratzyklus"],
        ["NADH", "ATP", "Citratzyklus", "Atmungskette"],
        ["Pyruvat", "Glykolyse", "Acetyl-CoA", "Gluconeogenese"],
        ["Kinase", "Phosphatase", "ATP", "ADP"],
        ["Fettsäuresynthese", "Acetyl-CoA", "NADH"],
        ["Allosterie", "Inhibitor", "Enzym"],
    ],
    3: [  # Histologie
        ["Osteoblasten", "Osteoklasten", "Osteozyten"],
        ["Epithel", "Endothel"],
        ["Bindegewebe", "Knorpel", "Knochen"],
        ["Kollagenfasern", "Elastin", "Fibroblasten"],
        ["Lamina basalis", "Basalmembran"],
        ["Tight Junction", "Gap Junction", "Desmosom"],
        ["Enchondrale Ossifikation", "Desmale Ossifikation"],
        ["Havers-Kanal", "Volkmann-Kanal"],
        ["Periost", "Endost"],
        ["Epiphysenfuge", "Wachstumsfuge"],
        ["Hämatopoese", "Erythropoese", "Granulopoese"],
        # Additional histology groupings
        ["Osteoblasten", "Knochen", "Periost", "Endost"],
        ["Chondrozyten", "Knorpel", "Bindegewebe", "Elastin"],
        ["Epithel", "Basalmembran", "Tight Junction"],
        ["Fibroblasten", "Bindegewebe", "Kollagenfasern"],
        ["Ossifikation", "Osteoblasten", "Osteoklasten", "Knochen"],
        ["Enchondrale Ossifikation", "Epiphysenfuge", "Knorpel"],
        ["Knochen", "Havers-Kanal", "Osteozyten"],
    ],
    4: [  # Physiologie
        ["Aktionspotential", "Ruhemembranpotential", "Depolarisation", "Repolarisation"],
        ["Nernst-Gleichung", "Goldman-Gleichung"],
        ["Acetylcholin", "Noradrenalin", "Serotonin", "Dopamin"],
        ["GABA", "Glutamat"],
        ["Herzminutenvolumen", "Schlagvolumen", "Ejektionsfraktion", "Frank-Starling"],
        ["Blutdruck", "Herzzeitvolumen"],
        ["GFR", "Filtration", "Reabsorption", "Sekretion", "Clearance"],
        ["Renin", "Angiotensin", "Aldosteron", "ADH"],
        ["Atemminutenvolumen", "Vitalkapazität", "Residualvolumen"],
        ["Compliance", "Surfactant"],
        ["Hyperpolarisation", "Refraktärzeit"],
        # Additional physiology groupings
        ["Synapse", "Neurotransmitter", "Acetylcholin", "GABA", "Glutamat"],
        ["Aktionspotential", "Erregungsleitung", "Synapse", "Refraktärzeit"],
        ["Na/K-ATPase", "Depolarisation", "Hyperpolarisation"],
        ["Gasaustausch", "Hämoglobin", "Surfactant", "Compliance"],
        ["Filtration", "Clearance", "GFR", "Blutdruck"],
        ["ADH", "Reabsorption", "Osmose"],
        ["Herzminutenvolumen", "Herzzeitvolumen", "Blutdruck"],
        ["Serotonin", "Dopamin", "Noradrenalin"],
        ["Aldosteron", "Reabsorption", "Na/K-ATPase"],
    ],
    5: [  # Chemie
        ["pH-Wert", "Henderson-Hasselbalch", "Puffersystem", "Bicarbonat"],
        ["Redoxreaktion", "Oxidation", "Reduktion"],
        ["Osmose", "Osmolarität", "Diffusion"],
        ["Ionenbindung", "Kovalente Bindung", "Wasserstoffbrücke", "Van-der-Waals"],
        ["Säure", "Base", "Elektrolyt"],
        ["Gibbs-Energie", "Enthalpie", "Entropie"],
        ["Gleichgewichtskonstante", "Gibbs-Energie"],
        # Additional chemistry groupings
        ["Säure", "Base", "pH-Wert", "Puffersystem"],
        ["Oxidation", "Reduktion", "Elektrolyt"],
        ["Diffusion", "Osmose", "Gleichgewichtskonstante"],
        ["Bicarbonat", "Säure", "Base", "Elektrolyt"],
        ["Enthalpie", "Gleichgewichtskonstante", "Gibbs-Energie"],
    ],
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _canonical_edge(a, b):
    """Return (term_a, term_b) in sorted order to avoid duplicates."""
    return (a, b) if a <= b else (b, a)


def _random_frequency(base=10):
    """Generate a plausible frequency with some variance."""
    return max(10, base + random.randint(-5, 20))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"Database: {DB_PATH}")

    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")

    # Ensure KG tables exist
    db.executescript("""
        CREATE TABLE IF NOT EXISTS kg_card_terms (
            card_id        INTEGER,
            term           TEXT,
            deck_id        INTEGER,
            is_definition  BOOLEAN DEFAULT 0,
            PRIMARY KEY (card_id, term)
        );
        CREATE INDEX IF NOT EXISTS idx_kg_card_terms_term ON kg_card_terms(term);

        CREATE TABLE IF NOT EXISTS kg_terms (
            term       TEXT PRIMARY KEY,
            frequency  INTEGER,
            embedding  BLOB
        );

        CREATE TABLE IF NOT EXISTS kg_edges (
            term_a     TEXT,
            term_b     TEXT,
            weight     INTEGER,
            PRIMARY KEY (term_a, term_b)
        );

        CREATE TABLE IF NOT EXISTS kg_definitions (
            term           TEXT PRIMARY KEY,
            definition     TEXT,
            sources        TEXT,
            source_count   INTEGER,
            generated_by   TEXT,
            created_at     TEXT DEFAULT (datetime('now')),
            updated_at     TEXT DEFAULT (datetime('now'))
        );
    """)
    db.commit()

    # Clear existing KG data
    print("Clearing existing KG data...")
    db.execute("DELETE FROM kg_card_terms")
    db.execute("DELETE FROM kg_terms")
    db.execute("DELETE FROM kg_edges")
    db.execute("DELETE FROM kg_definitions")
    db.commit()

    # ----- Insert terms -----
    all_terms = {}  # term -> deck_id
    card_id_counter = 900_000  # Use high IDs to avoid clashing with real cards

    for deck_id, subject in SUBJECTS.items():
        for term in subject["terms"]:
            all_terms[term] = deck_id

    print(f"Inserting {len(all_terms)} terms...")

    for term, deck_id in all_terms.items():
        freq = _random_frequency(base=15 + random.randint(0, 30))

        # Insert into kg_terms with frequency
        db.execute(
            "INSERT OR REPLACE INTO kg_terms (term, frequency) VALUES (?, ?)",
            (term, freq),
        )

        # Create fake card_term entries (2-6 cards per term for realistic frequencies)
        n_cards = random.randint(2, 6)
        for i in range(n_cards):
            card_id_counter += 1
            db.execute(
                "INSERT OR REPLACE INTO kg_card_terms (card_id, term, deck_id, is_definition) "
                "VALUES (?, ?, ?, ?)",
                (card_id_counter, term, deck_id, 1 if i == 0 else 0),
            )

    db.commit()

    # ----- Insert edges -----
    edges = {}  # (a, b) -> weight

    # 1. Within-subject edges (weight=2)
    for deck_id, groups in WITHIN_SUBJECT_GROUPS.items():
        for group in groups:
            for i, a in enumerate(group):
                for b in group[i + 1:]:
                    key = _canonical_edge(a, b)
                    edges[key] = max(edges.get(key, 0), 2)

    # 2. Cross-subject edges (higher weights)
    for a, b, w in CROSS_EDGES:
        key = _canonical_edge(a, b)
        edges[key] = max(edges.get(key, 0), w)

    # Validate all edge endpoints exist
    valid_edges = {k: v for k, v in edges.items() if k[0] in all_terms and k[1] in all_terms}
    invalid = len(edges) - len(valid_edges)
    if invalid > 0:
        print(f"  Warning: {invalid} edges reference non-existent terms (skipped)")

    print(f"Inserting {len(valid_edges)} edges...")
    for (a, b), w in valid_edges.items():
        db.execute(
            "INSERT OR REPLACE INTO kg_edges (term_a, term_b, weight) VALUES (?, ?, ?)",
            (a, b, w),
        )
    db.commit()

    # ----- Summary -----
    n_terms = db.execute("SELECT COUNT(*) FROM kg_terms").fetchone()[0]
    n_edges = db.execute("SELECT COUNT(*) FROM kg_edges").fetchone()[0]
    n_cards = db.execute("SELECT COUNT(DISTINCT card_id) FROM kg_card_terms").fetchone()[0]

    print(f"\nDone!")
    print(f"  Terms:  {n_terms}")
    print(f"  Edges:  {n_edges}")
    print(f"  Cards:  {n_cards}")
    print(f"  Decks:  {len(SUBJECTS)}")

    # Per-subject breakdown
    for deck_id, subject in SUBJECTS.items():
        count = len(subject["terms"])
        print(f"    [{deck_id}] {subject['name']}: {count} terms")

    db.close()


if __name__ == "__main__":
    main()
