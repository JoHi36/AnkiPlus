export interface DemoScenario {
  id: string;
  category: string;
  card: {
    front: string;
    back: string;
    tags: string[];
  };
  evaluation: {
    userTyping: string;
    feedback: string;
    score: number; // 0-100
  };
  rescue: {
    question: string;
    options: Array<{
      id: string;
      text: string;
      correct: boolean;
      explanation?: string;
    }>;
  };
  deepMode: {
    steps: string[];
    answerMarkdown: string;
    citations: string[];
  };
}

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  medicine: {
    id: 'med_hyperkalemia',
    category: 'Medizin',
    card: {
      front: 'EKG-Veränderungen bei Hyperkaliämie',
      back: '1. Hohe, spitze T-Wellen ("Zelt-T")\n2. PQ-Verlängerung & P-Abflachung\n3. QRS-Verbreiterung\n4. Sinusarrest / Kammerflimmern',
      tags: ['Kardiologie', 'Notfallmedizin', 'Elektrolyte']
    },
    evaluation: {
      userTyping: 'Also... man sieht auf jeden Fall hohe T-Wellen. Ich glaube auch eine QRS-Verbreiterung? Und am Ende Herzstillstand.',
      feedback: 'Sehr gut erkannt! ✅ **Hohe T-Wellen (Zelt-T)** und **QRS-Verbreiterung** sind korrekt. \n\n⚠️ **Ergänzung:** Du hast die **P-Wellen-Veränderungen** (Abflachung/Verlust) und die **PQ-Verlängerung** vergessen, die oft vor der QRS-Verbreiterung auftreten.',
      score: 75
    },
    rescue: {
      question: 'Welches ist das **früheste** typische EKG-Zeichen einer Hyperkaliämie (> 5.5 mmol/l)?',
      options: [
        { id: 'A', text: 'QRS-Verbreiterung', correct: false, explanation: 'Tritt meist erst bei schwerer Hyperkaliämie (> 7.0 mmol/l) auf.' },
        { id: 'B', text: 'Hohe, spitze T-Wellen ("Zelt-T")', correct: true, explanation: 'Korrekt! Das Zelt-T ist oft das erste Warnzeichen.' },
        { id: 'C', text: 'Kammerflimmern', correct: false, explanation: 'Dies ist eine späte, lebensbedrohliche Komplikation.' },
        { id: 'D', text: 'U-Wellen', correct: false, explanation: 'Typisch für Hypokaliämie, nicht Hyperkaliämie.' }
      ]
    },
    deepMode: {
      steps: [
        'Analysiere Ruhemembranpotential...', 
        'Scanne Leitlinien (ERC / ESC 2021)...',
        'Korreliere Kaliumspiegel mit EKG-Phasen...', 
        'Synthetisiere pathophysiologische Kette...'
      ],
      citations: ['Herold Innere Medizin', 'Amboss Leitlinien', 'ERC Guidelines 2021'],
      answerMarkdown: `
### Die pathophysiologische Kette der Hyperkaliämie

Die EKG-Veränderungen korrelieren direkt mit der **Verschiebung des Ruhemembranpotentials** (weniger negativ) und der **Inaktivierung von Natriumkanälen**.

```ecgimage```

#### 1. Milde Hyperkaliämie (5,5 - 6,5 mmol/l)
*   **Zelt-T:** Durch die erhöhte extrazelluläre Kaliumkonzentration erhöht sich die Repolarisationsgeschwindigkeit (verkürzte Phase 3 des Aktionspotentials).
*   **Klinik:** Meist noch asymptomatisch, aber im EKG als *hohe, spitze T-Welle* mit schmaler Basis sichtbar.

```mermaiddiagram```

#### 2. Moderate Hyperkaliämie (6,5 - 7,5 mmol/l)
*   **Vorhof-Blockade:** Das Ruhepotential im Vorhof wird instabil.
    *   P-Welle flacht ab und wird breiter.
    *   PQ-Zeit verlängert sich (AV-Überleitungsstörung).
*   **Wichtig:** *P-Wellen können komplett verschwinden (sinoventrikuläre Leitung).*

#### 3. Schwere Hyperkaliämie (> 7,5 mmol/l)
*   **Intraventrikuläre Leitungsverzögerung:**
    *   **QRS-Verbreiterung:** Das Herz leitet immer langsamer.
    *   Verschmelzung von QRS und T-Welle zur *"Sinuswelle"*.
*   **Gefahr:** Asystolie oder Kammerflimmern.

> **Merksatz:** "Das T zieht das QRS auseinander, bis alles zur Sinuswelle wird."
`
    }
  },
  law: {
    id: 'law_mord',
    category: 'Jura',
    card: {
      front: 'Mordmerkmale (§ 211 StGB) - 2. Gruppe (Tatbegehung)',
      back: '1. Heimtücke\n2. Grausamkeit\n3. Gemeingefährliche Mittel',
      tags: ['Strafrecht', 'BT', 'Tötungsdelikte']
    },
    evaluation: {
      userTyping: 'Heimtücke und Grausamkeit fallen mir ein. War da nicht noch was mit Waffen?',
      feedback: 'Guter Anfang! ✅ **Heimtücke** und **Grausamkeit** sind korrekt. \n\n⚠️ **Korrektur:** "Waffen" ist kein eigenständiges Merkmal. Das dritte Merkmal der 2. Gruppe sind **gemeingefährliche Mittel** (Mittel, deren Wirkung der Täter nicht beherrschen kann, z.B. Bombe, Brandstiftung).',
      score: 60
    },
    rescue: {
      question: 'Wann handelt ein Täter "heimtückisch"?',
      options: [
        { id: 'A', text: 'Wenn er die Arg- und Wehrlosigkeit des Opfers bewusst ausnutzt', correct: true, explanation: 'Klassische Definition in feindlicher Willensrichtung.' },
        { id: 'B', text: 'Wenn er besonders grausam vorgeht', correct: false, explanation: 'Das wäre das Merkmal der Grausamkeit.' },
        { id: 'C', text: 'Wenn er eine Waffe benutzt', correct: false, explanation: 'Waffenbesitz allein begründet keine Heimtücke.' },
        { id: 'D', text: 'Wenn er aus Habgier handelt', correct: false, explanation: 'Habgier gehört zur 1. Gruppe (niedrige Beweggründe).' }
      ]
    },
    deepMode: {
      steps: [
        'Analysiere § 211 StGB Struktur...', 
        'Prüfe BGH Rechtsprechung zu Heimtücke...', 
        'Vergleiche "Restriktive Auslegung"...', 
        'Synthetisiere Definitionen...'
      ],
      citations: ['BGHSt 32, 382', 'Fischer StGB § 211', 'Schönke/Schröder'],
      answerMarkdown: `
### Heimtücke (§ 211 Abs. 2 Gr. 2 Var. 1 StGB)

Heimtücke ist das mit Abstand klausurrelevanteste Mordmerkmal.

#### 1. Definition (BGH)
Heimtückisch handelt, wer die **Arg-** und **Wehrlosigkeit** des Opfers in feindlicher Willensrichtung bewusst ausnutzt.

*   **Arglos:** Wer sich zum Zeitpunkt der Tat keines Angriffs auf Leib oder Leben versieht.
*   **Wehrlos:** Wer infolge seiner Arglosigkeit in seiner Verteidigungsfähigkeit zumindest stark eingeschränkt ist.

#### 2. Problem: "Lehre vom Rechtsfolgenlösung"
Da § 211 eine **absolute lebenslange Freiheitsstrafe** anordnet, versucht die Lehre (und teils der BGH), das Merkmal restriktiv auszulegen, um "gerechte" Ergebnisse bei Haustyrannen-Fällen zu erzielen.

*   **Lit:** Fordert einen *besonders verwerflichen Vertrauensbruch*.
*   **BGH:** Bleibt bei der Definition, wendet aber bei "außergewöhnlichen Umständen" § 49 StGB analog an (Rechtsfolgenlösung).

> **Klausur-Tipp:** Prüfe immer zuerst die Arglosigkeit. Schlafende sind arglos (nehmen die Arglosigkeit "mit in den Schlaf"), Bewusstlose nicht (können keine Arglosigkeit bilden).
`
    }
  }
};
