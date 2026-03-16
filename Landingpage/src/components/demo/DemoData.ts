export interface DemoScenario {
  id: string;
  category: string;
  card: {
    front: string;
    back: string;
    tags: string[];
    deckName: string;
  };
  evaluation: {
    userTyping: string;
    score: number;
    label: string;
    feedback: string;
    missing?: string;
  };
  timer: {
    seconds: number;
    ease: number;
    label: string;
    color: string;
  };
  mc: {
    options: Array<{
      id: string;
      text: string;
      correct: boolean;
      explanation: string;
    }>;
  };
  chat: {
    userQuestion: string;
    aiResponse: string;
  };
}

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  medicine: {
    id: 'medicine',
    category: 'Medizin',
    card: {
      front: '<span class="text-yellow-400">Wie</span> kann eine <span class="text-orange-400 font-bold">Bandscheibe</span> (<span class="text-teal-400">Discus intervertebralis</span>) <span class="text-green-400">langfristigen Belastungen</span> <span class="text-blue-400">entgegenwirken</span>?',
      back: '<h3 class="text-orange-400 font-bold text-lg mb-4">Flüssigkeitsabgabe</h3><p class="text-white/80 italic leading-relaxed">Körpergröße nimmt während des Tages um 1\u20132 cm ab<br/>Flüssigkeitsaufnahme der Bandscheibe bei Entlastung<br/><span class="text-green-400 underline">Kurzfristige Belastungen</span>: Durch Stoßdämpferfunktion von der Bandscheibe abgefangen</p>',
      tags: ['Wirbelsäule'],
      deckName: 'Wirbelsäule',
    },
    evaluation: {
      userTyping: 'Die Bandscheibe gibt tagsüber Flüssigkeit ab und nimmt sie nachts wieder auf. Dadurch wirkt sie wie ein Stoßdämpfer.',
      score: 75,
      label: 'Good',
      feedback: 'Stoßdämpferfunktion und Flüssigkeitsabgabe korrekt erkannt.',
      missing: 'Körpergröße-Abnahme um 1\u20132 cm und Unterschied kurzfristige vs. langfristige Belastung fehlt.',
    },
    timer: {
      seconds: 8,
      ease: 3,
      label: 'Good',
      color: '#30d158',
    },
    mc: {
      options: [
        { id: 'A', text: 'Durch Verknöcherung des Anulus fibrosus', correct: false, explanation: 'Die Bandscheibe bleibt flexibel \u2013 Verknöcherung wäre pathologisch.' },
        { id: 'B', text: 'Durch Flüssigkeitsabgabe und -aufnahme (Tag/Nacht-Zyklus)', correct: true, explanation: 'Korrekt! Tagsüber gibt die Bandscheibe unter Last Flüssigkeit ab, nachts wird sie bei Entlastung resorbiert.' },
        { id: 'C', text: 'Durch Fusion mit den Wirbelkörpern', correct: false, explanation: 'Die Bandscheibe liegt zwischen den Wirbeln und ist nicht mit ihnen fusioniert.' },
        { id: 'D', text: 'Durch permanente Knorpelneubildung', correct: false, explanation: 'Die Bandscheibe hat nur begrenzte Regenerationsfähigkeit.' },
      ],
    },
    chat: {
      userQuestion: 'Was genau passiert mit der Bandscheibe bei Belastung?',
      aiResponse: "### Bandscheibe unter Belastung\n\nDie **Bandscheibe** (Discus intervertebralis) besteht aus zwei Hauptkomponenten:\n\n1. **Äußerer Faserring (Anulus fibrosus):** Zähe, faserige Hülle, die wie ein fester Ring die Bandscheibe umschließt und Stabilität gibt.\n2. **Gallertkern (Nucleus pulposus):** Weicher, gelartiger Kern im Inneren \u2013 sehr elastisch und wasserreich.\n\n#### Bei langfristiger Belastung (tagsüber):\n- Der Nucleus pulposus gibt **Flüssigkeit an die Umgebung ab**\n- Die Bandscheibe wird dadurch flacher\n- Die **Körpergröße nimmt um 1\u20132 cm ab**\n\n#### Bei Entlastung (nachts):\n- Der Nucleus pulposus **saugt Flüssigkeit zurück**\n- Die Bandscheibe quillt wieder auf\n- Morgens ist man daher etwas größer\n\n> **Merksatz:** Die Bandscheibe funktioniert wie ein Schwamm \u2013 tagsüber wird sie ausgepresst, nachts saugt sie sich wieder voll.",
    },
  },
  law: {
    id: 'law',
    category: 'Jura',
    card: {
      front: 'Nenne die <span class="text-orange-400 font-bold">Mordmerkmale</span> der <span class="text-teal-400">2. Gruppe</span> (<span class="text-green-400">Tatbegehung</span>) nach <span class="text-blue-400">§ 211 StGB</span>.',
      back: '<p class="text-white/80 italic leading-relaxed"><strong>1. Heimtücke</strong><br/><strong>2. Grausamkeit</strong><br/><strong>3. Gemeingefährliche Mittel</strong></p>',
      tags: ['Strafrecht', 'BT'],
      deckName: 'Strafrecht BT',
    },
    evaluation: {
      userTyping: 'Heimtücke und Grausamkeit fallen mir ein. War da nicht noch was mit Waffen?',
      score: 60,
      label: 'Hard',
      feedback: 'Heimtücke und Grausamkeit korrekt. "Waffen" ist kein eigenständiges Merkmal.',
      missing: 'Das dritte Merkmal sind gemeingefährliche Mittel (z.B. Bombe, Brandstiftung).',
    },
    timer: {
      seconds: 14,
      ease: 2,
      label: 'Hard',
      color: '#ffd60a',
    },
    mc: {
      options: [
        { id: 'A', text: 'Habgier, Mordlust, Befriedigung des Geschlechtstriebs', correct: false, explanation: 'Diese gehören zur 1. Gruppe (niedrige Beweggründe).' },
        { id: 'B', text: 'Heimtücke, Grausamkeit, gemeingefährliche Mittel', correct: true, explanation: 'Korrekt! Dies sind die drei Mordmerkmale der 2. Gruppe (Art der Tatbegehung).' },
        { id: 'C', text: 'Verdeckungsabsicht, Ermöglichungsabsicht', correct: false, explanation: 'Diese gehören zur 3. Gruppe (Tatzweck).' },
        { id: 'D', text: 'Heimtücke, Grausamkeit, Hinterlist', correct: false, explanation: 'Hinterlist ist kein eigenständiges Mordmerkmal in § 211 StGB.' },
      ],
    },
    chat: {
      userQuestion: 'Was genau bedeutet Heimtücke?',
      aiResponse: "### Heimtücke (§ 211 Abs. 2 Gr. 2 Var. 1 StGB)\n\nHeimtücke ist das klausurrelevanteste Mordmerkmal.\n\n#### Definition (BGH)\nHeimtückisch handelt, wer die **Arg- und Wehrlosigkeit** des Opfers in feindlicher Willensrichtung bewusst zur Tötung ausnutzt.\n\n- **Arglos:** Wer sich zum Zeitpunkt der Tat keines Angriffs auf Leib oder Leben versieht.\n- **Wehrlos:** Wer infolge seiner Arglosigkeit in seiner Verteidigungsfähigkeit stark eingeschränkt ist.\n\n#### Wichtige Fallgruppen\n1. **Schlafende** \u2192 arglos (nehmen Arglosigkeit \"mit in den Schlaf\")\n2. **Bewusstlose** \u2192 nicht arglos (können keine Arglosigkeit bilden)\n3. **Kleinkinder** \u2192 str., h.M. (+) analog\n\n> **Klausur-Tipp:** Immer zuerst die Arglosigkeit prüfen. Die Wehrlosigkeit folgt daraus.",
    },
  },
  business: {
    id: 'business',
    category: 'BWL',
    card: {
      front: 'Erkläre den Unterschied zwischen <span class="text-orange-400 font-bold">WACC</span> und <span class="text-teal-400">CAPM</span> bei der <span class="text-green-400">Unternehmensbewertung</span>.',
      back: '<h3 class="text-orange-400 font-bold text-lg mb-4">WACC vs. CAPM</h3><p class="text-white/80 italic leading-relaxed"><strong>WACC</strong> = gewichtete durchschnittliche Kapitalkosten (EK + FK)<br/><strong>CAPM</strong> = Modell zur Bestimmung der EK-Rendite<br/><span class="text-green-400 underline">CAPM fließt als EK-Komponente in den WACC ein</span></p>',
      tags: ['Corporate Finance'],
      deckName: 'Corporate Finance',
    },
    evaluation: {
      userTyping: 'WACC sind die Gesamtkapitalkosten und CAPM berechnet die Eigenkapitalkosten. CAPM ist Teil vom WACC.',
      score: 85,
      label: 'Good',
      feedback: 'Kernaussage korrekt: CAPM bestimmt EK-Kosten, die in den WACC einfließen.',
      missing: 'Formel-Bestandteile (risikofreier Zins, Beta, Marktprämie) und FK-Gewichtung nicht erwähnt.',
    },
    timer: {
      seconds: 6,
      ease: 3,
      label: 'Good',
      color: '#30d158',
    },
    mc: {
      options: [
        { id: 'A', text: 'WACC ist ein Teilmodell des CAPM', correct: false, explanation: 'Umgekehrt: CAPM liefert die EK-Rendite, die in den WACC einfließt.' },
        { id: 'B', text: 'CAPM bestimmt die EK-Kosten, die als Komponente in den WACC eingehen', correct: true, explanation: 'Korrekt! WACC = EK-Anteil \u00d7 CAPM-Rendite + FK-Anteil \u00d7 FK-Zinssatz \u00d7 (1\u2013Steuersatz).' },
        { id: 'C', text: 'Beide Modelle sind unabhängig voneinander', correct: false, explanation: 'Sie sind direkt verknüpft \u2013 CAPM liefert eine zentrale WACC-Inputgröße.' },
        { id: 'D', text: 'WACC berücksichtigt nur Eigenkapital', correct: false, explanation: 'WACC gewichtet sowohl Eigen- als auch Fremdkapitalkosten.' },
      ],
    },
    chat: {
      userQuestion: 'Wie berechnet man den WACC konkret?',
      aiResponse: "### WACC-Berechnung\n\nDer **Weighted Average Cost of Capital** berechnet sich als:\n\n`WACC = (E/V) \u00d7 Re + (D/V) \u00d7 Rd \u00d7 (1 \u2013 Tc)`\n\n#### Variablen:\n- **E/V** = Eigenkapitalanteil am Gesamtkapital\n- **Re** = Eigenkapitalkosten (via **CAPM**: `Re = Rf + \u03b2 \u00d7 (Rm \u2013 Rf)`)\n- **D/V** = Fremdkapitalanteil\n- **Rd** = Fremdkapitalkosten (Zinssatz)\n- **Tc** = Unternehmenssteuersatz (Tax Shield)\n\n#### Praxisbeispiel:\n- EK-Quote: 60%, FK-Quote: 40%\n- CAPM-Rendite: 8%, FK-Zins: 4%, Steuersatz: 30%\n- **WACC** = 0,6 \u00d7 8% + 0,4 \u00d7 4% \u00d7 0,7 = **5,92%**\n\n> **Merksatz:** Der WACC ist der Diskontierungssatz für die DCF-Bewertung \u2013 er spiegelt das Risiko des gesamten Unternehmens wider.",
    },
  },
};
