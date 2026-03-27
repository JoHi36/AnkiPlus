import { Link } from 'react-router-dom';
import { PageNav } from '../components/PageNav';

export function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white/[0.55] font-[var(--lp-font)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageNav />

        <h1 className="text-3xl font-semibold text-white/[0.92] mb-2">Datenschutzerklärung</h1>
        <p className="text-sm text-white/[0.35] mb-12">Stand: März 2026</p>

        {/* ═══ 1. VERANTWORTLICHER ═══ */}
        <Section title="1. Verantwortlicher">
          <p>Johannes Hinkel<br/>Karl-Marx-Allee 64<br/>10243 Berlin<br/>Deutschland</p>
          <p className="mt-2">E-Mail: <a href="mailto:Johannes_Hinkel@icloud.com" className="text-[#0a84ff] hover:underline">Johannes_Hinkel@icloud.com</a></p>
        </Section>

        {/* ═══ 2. ÜBERBLICK ═══ */}
        <Section title="2. Überblick der Datenverarbeitung">
          <p>
            AnkiPlus ist eine KI-gestützte Lernplattform, die als Erweiterung für die Lernkarten-Software Anki angeboten wird.
            Ergänzend gibt es eine Webseite (anki-plus.vercel.app) für Account-Verwaltung und Informationen.
          </p>
          <p className="mt-3">
            Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung unserer Dienste erforderlich ist
            oder Sie eingewilligt haben. Diese Datenschutzerklärung informiert Sie über Art, Umfang und Zweck der
            Datenverarbeitung.
          </p>
        </Section>

        {/* ═══ 3. RECHTSGRUNDLAGEN ═══ */}
        <Section title="3. Rechtsgrundlagen">
          <p>Die Verarbeitung Ihrer Daten erfolgt auf Grundlage folgender Rechtsgrundlagen der DSGVO:</p>
          <ul className="list-disc list-inside mt-3 space-y-2">
            <li><strong className="text-white/[0.75]">Art. 6 Abs. 1 lit. a</strong> — Einwilligung: Sie haben Ihre Einwilligung für einen bestimmten Verarbeitungszweck erteilt.</li>
            <li><strong className="text-white/[0.75]">Art. 6 Abs. 1 lit. b</strong> — Vertragserfüllung: Die Verarbeitung ist zur Erfüllung eines Vertrags oder zur Durchführung vorvertraglicher Maßnahmen erforderlich.</li>
            <li><strong className="text-white/[0.75]">Art. 6 Abs. 1 lit. f</strong> — Berechtigtes Interesse: Die Verarbeitung ist zur Wahrung unserer berechtigten Interessen erforderlich, sofern Ihre Interessen nicht überwiegen.</li>
          </ul>
        </Section>

        {/* ═══ 4. HOSTING ═══ */}
        <Section title="4. Hosting und Bereitstellung">
          <h4 className="text-white/[0.75] font-medium mb-2">Webseite (Vercel)</h4>
          <p>
            Unsere Webseite wird bei Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, USA) gehostet.
            Beim Aufruf der Webseite werden automatisch technische Daten (IP-Adresse, Browsertyp, Betriebssystem,
            Zeitpunkt des Zugriffs) in Server-Logfiles erfasst. Dies ist technisch notwendig für die Auslieferung der Webseite.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der technischen Bereitstellung).
            Vercel ist unter dem EU-US Data Privacy Framework zertifiziert.
            Ein Auftragsverarbeitungsvertrag (DPA) mit Vercel liegt vor.
          </p>

          <h4 className="text-white/[0.75] font-medium mt-6 mb-2">Backend-Infrastruktur (Google Cloud)</h4>
          <p>
            Unsere Backend-Dienste (API, Cloud Functions) werden auf Google Cloud Platform in der Region
            europe-west1 (Belgien) betrieben. Betreiber ist Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
            Die Google Cloud Data Processing Addendum (CDPA) findet Anwendung.
          </p>
        </Section>

        {/* ═══ 5. NUTZERKONTO ═══ */}
        <Section title="5. Nutzerkonto und Authentifizierung">
          <p>
            Für die Nutzung von AnkiPlus können Sie ein Nutzerkonto erstellen. Dabei werden folgende Daten verarbeitet:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1">
            <li>E-Mail-Adresse</li>
            <li>Nutzer-ID (Firebase UID)</li>
            <li>Authentifizierungs-Tokens</li>
            <li>Erstellungszeitpunkt des Kontos</li>
            <li>Abonnement-Status und -Tier</li>
          </ul>
          <p className="mt-3">
            Die Authentifizierung erfolgt über Firebase Authentication (Google Ireland Limited).
            Firebase Authentication verarbeitet Daten möglicherweise auch in Rechenzentren außerhalb der EU.
            Es gelten die Google Cloud Data Processing Terms und Standard Contractual Clauses (SCCs) als Transfermechanismus.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
          </p>

          <h4 className="text-white/[0.75] font-medium mt-6 mb-2">Nutzerprofildaten (Firestore)</h4>
          <p>
            Ihr Nutzerprofil wird in Cloud Firestore (Region: europe-west1, Belgien) gespeichert.
            Gespeichert werden: Abonnement-Tier, Stripe-Kunden-ID, Abonnement-Status und Abrechnungszeitraum.
          </p>

          <h4 className="text-white/[0.75] font-medium mt-6 mb-2">Nutzung ohne Konto</h4>
          <p>
            AnkiPlus kann eingeschränkt auch ohne Nutzerkonto verwendet werden.
            In diesem Fall wird eine pseudonyme Geräte-ID (UUID) erzeugt und zusammen mit Ihrer IP-Adresse
            zur Durchsetzung von Nutzungsquoten gespeichert.
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am Missbrauchsschutz).
          </p>
        </Section>

        {/* ═══ 6. KI-LERNUNTERSTÜTZUNG ═══ */}
        <Section title="6. KI-gestützte Lernunterstützung">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 mb-4">
            <p className="text-white/[0.75] text-sm">
              <strong>Hinweis zur KI-Nutzung:</strong> AnkiPlus verwendet künstliche Intelligenz (KI) zur Lernunterstützung.
              Ihre Eingaben (Fragen, Karteninhalte) werden an KI-Anbieter übermittelt, um Antworten zu generieren.
              KI-generierte Antworten können Fehler enthalten und stellen keine fachliche Beratung dar.
            </p>
          </div>

          <h4 className="text-white/[0.75] font-medium mb-2">Chat und Tutoring (OpenRouter / Google Gemini)</h4>
          <p>
            Wenn Sie die Chat-Funktion oder den Tutor-Agenten nutzen, werden folgende Daten an den
            KI-Dienstleister OpenRouter Inc. (USA) übermittelt:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Ihre Eingabe (Frage, Nachricht)</li>
            <li>Kontext der aktuellen Lernkarte (Frage- und Antworttext)</li>
            <li>Bisheriger Gesprächsverlauf der aktuellen Sitzung</li>
            <li>Systemanweisungen (enthalten keine personenbezogenen Daten)</li>
          </ul>
          <p className="mt-3">
            OpenRouter leitet die Anfragen an das KI-Modell Google Gemini (Google LLC) weiter.
            Bei der kostenpflichtigen API-Nutzung werden Eingaben und Ausgaben von Google nicht zum Training
            von KI-Modellen verwendet.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung — die KI-Funktionalität ist Kernbestandteil des Dienstes).
          </p>

          <h4 className="text-white/[0.75] font-medium mt-6 mb-2">Embedding-Verarbeitung (Google Gemini Embedding API)</h4>
          <p>
            Zur semantischen Suche über Ihre Lernkarten werden Kartentexte in numerische Vektoren (Embeddings) umgewandelt.
            Dazu werden Kartentexte (maximal 2.000 Zeichen pro Karte, in Stapeln von bis zu 50 Karten) an die
            Google Gemini Embedding API übermittelt. Die resultierenden Vektoren werden nur lokal im Arbeitsspeicher
            gehalten und nicht dauerhaft gespeichert.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
          </p>
        </Section>

        {/* ═══ 7. RECHERCHE ═══ */}
        <Section title="7. Recherche-Funktion">
          <p>
            Der Research-Agent kann auf externe Wissensdatenbanken zugreifen.
            Dabei werden Ihre Suchanfragen an folgende Dienste übermittelt:
          </p>

          <h4 className="text-white/[0.75] font-medium mt-4 mb-2">PubMed / NCBI (National Center for Biotechnology Information)</h4>
          <p>
            Betreiber: U.S. National Library of Medicine, Bethesda, MD, USA.
            Übermittelt werden: Suchanfragen für medizinisch-wissenschaftliche Literatur.
            PubMed ist ein öffentlich zugänglicher Dienst ohne Registrierungspflicht.
          </p>

          <h4 className="text-white/[0.75] font-medium mt-4 mb-2">Wikipedia / Wikimedia</h4>
          <p>
            Betreiber: Wikimedia Foundation Inc., San Francisco, CA, USA.
            Übermittelt werden: Suchanfragen für Enzyklopädie-Artikel und Medieninhalte.
          </p>

          <h4 className="text-white/[0.75] font-medium mt-4 mb-2">PubChem / NCBI</h4>
          <p>
            Betreiber: U.S. National Library of Medicine, Bethesda, MD, USA.
            Übermittelt werden: Suchanfragen nach chemischen Verbindungen zur Darstellung von Molekülstrukturen.
          </p>

          <h4 className="text-white/[0.75] font-medium mt-4 mb-2">Perplexity (über OpenRouter)</h4>
          <p>
            Für webbasierte Recherchen wird das Modell Perplexity Sonar über OpenRouter angesprochen.
            Dabei können Suchanfragen von Perplexity an weitere Webdienste weitergeleitet werden.
          </p>

          <p className="mt-4">
            Rechtsgrundlage für alle Recherche-Dienste: Art. 6 Abs. 1 lit. f DSGVO
            (berechtigtes Interesse an der Bereitstellung einer umfassenden Lernunterstützung).
            Die Nutzung der Recherche-Funktion ist optional.
          </p>
        </Section>

        {/* ═══ 8. ZAHLUNGSABWICKLUNG ═══ */}
        <Section title="8. Zahlungsabwicklung (Stripe)">
          <p>
            Für kostenpflichtige Abonnements nutzen wir den Zahlungsdienstleister
            Stripe Technology Europe Limited, 1 Grand Canal Street Lower, Dublin 2, Irland.
          </p>
          <p className="mt-3">Bei einem Kaufvorgang werden an Stripe übermittelt:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>E-Mail-Adresse</li>
            <li>Gewähltes Abonnement (Tier)</li>
            <li>Interne Nutzer-ID</li>
          </ul>
          <p className="mt-3">
            Zahlungsdaten (Kreditkartennummer, Bankdaten) werden ausschließlich von Stripe verarbeitet
            und erreichen unsere Server zu keinem Zeitpunkt. Stripe ist PCI-DSS Level 1 zertifiziert.
          </p>
          <p className="mt-2">
            Stripe verarbeitet Daten auch in den USA. Stripe ist unter dem EU-US Data Privacy Framework
            zertifiziert und setzt zusätzlich Standard Contractual Clauses (SCCs) ein.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
            Rechnungsdaten werden gemäß steuerrechtlicher Aufbewahrungspflichten (§147 AO, §257 HGB)
            für 10 Jahre aufbewahrt.
          </p>
          <p className="mt-2">
            Datenschutzerklärung von Stripe: <a href="https://stripe.com/de/privacy" className="text-[#0a84ff] hover:underline" target="_blank" rel="noopener noreferrer">stripe.com/de/privacy</a>
          </p>
        </Section>

        {/* ═══ 9. NUTZUNGSANALYSE ═══ */}
        <Section title="9. Nutzungsanalyse und Quotenverwaltung">
          <p>
            Zur Durchsetzung von Nutzungsquoten und zur Verbesserung unseres Dienstes erfassen wir:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Anzahl der täglichen und wöchentlichen KI-Anfragen</li>
            <li>Verbrauchte Tokens (Eingabe/Ausgabe)</li>
            <li>Verwendetes KI-Modell</li>
            <li>Fehlerereignisse (ohne Nachrichteninhalte)</li>
          </ul>
          <p className="mt-3">
            Diese Daten werden in Cloud Firestore (Region: europe-west1) gespeichert und sind mit Ihrer
            Nutzer-ID verknüpft. Es werden keine Nachrichteninhalte in der Nutzungsanalyse gespeichert.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Durchsetzung
            fairer Nutzungslimits und an der Stabilität des Dienstes).
          </p>
          <p className="mt-2">
            Wir setzen <strong className="text-white/[0.75]">keine</strong> externen Analyse-Tools
            (Google Analytics, Sentry o.ä.) ein.
          </p>
        </Section>

        {/* ═══ 10. LOKALE DATEN ═══ */}
        <Section title="10. Lokale Datenspeicherung (Anki-Addon)">
          <p>
            Das AnkiPlus-Addon speichert Daten lokal auf Ihrem Gerät in SQLite-Datenbanken:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Chat-Verläufe pro Lernkarte (maximal 200 Nachrichten pro Karte)</li>
            <li>Lernkarten-Sitzungen und Abschnitte</li>
            <li>Wissensgrafen-Daten (extrahierte Begriffe und Zusammenhänge)</li>
            <li>Multiple-Choice-Cache</li>
            <li>Einstellungen und Authentifizierungs-Tokens</li>
          </ul>
          <p className="mt-3">
            Diese Daten verbleiben auf Ihrem Gerät und werden nicht an unsere Server übertragen,
            es sei denn, Sie nutzen aktiv die KI-Funktionen (siehe Abschnitt 6).
            Sie können die lokalen Daten jederzeit löschen, indem Sie das Addon deinstallieren.
          </p>
        </Section>

        {/* ═══ 11. GOOGLE FONTS ═══ */}
        <Section title="11. Google Fonts">
          <p>
            Unsere Webseite nutzt Schriftarten von Google Fonts (Google Ireland Limited).
            Beim Laden der Schriftarten wird Ihre IP-Adresse an Google-Server übermittelt.
          </p>
          <p className="mt-2">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
            einheitlichen Darstellung). Google ist unter dem EU-US Data Privacy Framework zertifiziert.
          </p>
          <p className="mt-2">
            Datenschutzerklärung von Google: <a href="https://policies.google.com/privacy" className="text-[#0a84ff] hover:underline" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a>
          </p>
        </Section>

        {/* ═══ 12. DRITTLANDTRANSFER ═══ */}
        <Section title="12. Empfänger und Drittlandtransfer">
          <p>
            Wir übermitteln personenbezogene Daten an folgende Empfänger, die teilweise in Drittländern
            (insbesondere USA) ansässig sind:
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-3 pr-4 text-white/[0.75] font-medium">Empfänger</th>
                  <th className="text-left py-3 pr-4 text-white/[0.75] font-medium">Zweck</th>
                  <th className="text-left py-3 text-white/[0.75] font-medium">Transfermechanismus</th>
                </tr>
              </thead>
              <tbody className="text-white/[0.55]">
                <tr className="border-b border-white/[0.04]">
                  <td className="py-3 pr-4">Google Ireland Ltd.</td>
                  <td className="py-3 pr-4">Auth, Firestore, Cloud Functions, Gemini API, Fonts</td>
                  <td className="py-3">EU-US DPF + SCCs + CDPA</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-3 pr-4">OpenRouter Inc.</td>
                  <td className="py-3 pr-4">KI-Chat-Verarbeitung</td>
                  <td className="py-3">DPA (in ToS), SCCs</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-3 pr-4">Stripe Technology Europe Ltd.</td>
                  <td className="py-3 pr-4">Zahlungsabwicklung</td>
                  <td className="py-3">EU-US DPF + SCCs</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-3 pr-4">Vercel Inc.</td>
                  <td className="py-3 pr-4">Webseiten-Hosting</td>
                  <td className="py-3">EU-US DPF + DPA</td>
                </tr>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-3 pr-4">NCBI / NLM (US-Behörde)</td>
                  <td className="py-3 pr-4">PubMed, PubChem (Recherche)</td>
                  <td className="py-3">Öffentliche Datenbanken</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4">Wikimedia Foundation</td>
                  <td className="py-3 pr-4">Wikipedia, Commons (Recherche)</td>
                  <td className="py-3">Öffentliche Datenbanken</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            Der EU-US Data Privacy Framework (DPF) stellt gemäß Angemessenheitsbeschluss der EU-Kommission
            vom 10. Juli 2023 ein angemessenes Datenschutzniveau sicher. Zusätzlich setzen wir auf
            Standardvertragsklauseln (SCCs) als ergänzende Schutzmaßnahme.
          </p>
        </Section>

        {/* ═══ 13. SPEICHERDAUER ═══ */}
        <Section title="13. Speicherdauer">
          <ul className="space-y-3">
            <li><strong className="text-white/[0.75]">Nutzerkonto:</strong> Bis zur Löschung des Kontos durch den Nutzer.</li>
            <li><strong className="text-white/[0.75]">Nutzungsstatistiken:</strong> Tägliche und wöchentliche Aggregate werden 90 Tage aufbewahrt.</li>
            <li><strong className="text-white/[0.75]">Analytics-Events:</strong> 90 Tage, danach automatische Löschung.</li>
            <li><strong className="text-white/[0.75]">Rechnungsdaten:</strong> 10 Jahre (steuerrechtliche Aufbewahrungspflicht, §147 AO).</li>
            <li><strong className="text-white/[0.75]">Lokale Daten (Addon):</strong> Bis zur Deinstallation des Addons oder manuellen Löschung.</li>
            <li><strong className="text-white/[0.75]">Chat-Verläufe (lokal):</strong> Maximal 200 Nachrichten pro Karte, ältere werden automatisch gelöscht.</li>
            <li><strong className="text-white/[0.75]">Anonyme Nutzungsdaten:</strong> Tagesbasiert, nach 90 Tagen gelöscht.</li>
          </ul>
        </Section>

        {/* ═══ 14. BETROFFENENRECHTE ═══ */}
        <Section title="14. Ihre Rechte">
          <p>Sie haben gemäß DSGVO folgende Rechte:</p>
          <ul className="list-disc list-inside mt-3 space-y-2">
            <li><strong className="text-white/[0.75]">Auskunftsrecht (Art. 15):</strong> Sie können Auskunft über die von uns verarbeiteten personenbezogenen Daten verlangen.</li>
            <li><strong className="text-white/[0.75]">Berichtigungsrecht (Art. 16):</strong> Sie können die Berichtigung unrichtiger Daten verlangen.</li>
            <li><strong className="text-white/[0.75]">Löschungsrecht (Art. 17):</strong> Sie können die Löschung Ihrer Daten verlangen, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</li>
            <li><strong className="text-white/[0.75]">Einschränkung der Verarbeitung (Art. 18):</strong> Sie können die Einschränkung der Verarbeitung verlangen.</li>
            <li><strong className="text-white/[0.75]">Datenübertragbarkeit (Art. 20):</strong> Sie können Ihre Daten in einem strukturierten, maschinenlesbaren Format erhalten.</li>
            <li><strong className="text-white/[0.75]">Widerspruchsrecht (Art. 21):</strong> Sie können der Verarbeitung auf Grundlage berechtigter Interessen widersprechen.</li>
            <li><strong className="text-white/[0.75]">Widerruf der Einwilligung (Art. 7 Abs. 3):</strong> Erteilte Einwilligungen können Sie jederzeit widerrufen.</li>
          </ul>
          <p className="mt-4">
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an: <a href="mailto:Johannes_Hinkel@icloud.com" className="text-[#0a84ff] hover:underline">Johannes_Hinkel@icloud.com</a>
          </p>
          <p className="mt-2">Wir werden Ihre Anfrage innerhalb eines Monats beantworten.</p>
        </Section>

        {/* ═══ 15. BESCHWERDERECHT ═══ */}
        <Section title="15. Beschwerderecht">
          <p>
            Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
            Die für uns zuständige Aufsichtsbehörde ist:
          </p>
          <p className="mt-3">
            Berliner Beauftragte für Datenschutz und Informationsfreiheit<br/>
            Friedrichstr. 219<br/>
            10969 Berlin<br/>
            <a href="https://www.datenschutz-berlin.de" className="text-[#0a84ff] hover:underline" target="_blank" rel="noopener noreferrer">www.datenschutz-berlin.de</a>
          </p>
        </Section>

        {/* ═══ 16. KI & AUTOMATISIERTE ENTSCHEIDUNGEN ═══ */}
        <Section title="16. Automatisierte Entscheidungsfindung und KI">
          <p>
            AnkiPlus nutzt künstliche Intelligenz zur Lernunterstützung (Erklärungen, Zusammenfassungen,
            Recherche, automatische Bewertung von Antworten). Es findet <strong className="text-white/[0.75]">kein
            Profiling</strong> im Sinne des Art. 22 DSGVO statt — es werden keine automatisierten
            Entscheidungen getroffen, die rechtliche Wirkung entfalten oder Sie in ähnlicher Weise
            erheblich beeinträchtigen.
          </p>
          <p className="mt-3">
            Die KI-gestützte Bewertung von Antworten dient ausschließlich als Lernhilfe und hat
            keinen Einfluss auf formale Bildungsbewertungen oder Zugangsentscheidungen.
          </p>
          <p className="mt-3">
            Gemäß Art. 4 der KI-Verordnung (EU) 2024/1689 weisen wir darauf hin, dass Sie bei der
            Nutzung von AnkiPlus mit einem KI-System interagieren.
          </p>
        </Section>

        {/* ═══ 17. ÄNDERUNGEN ═══ */}
        <Section title="17. Änderungen dieser Datenschutzerklärung">
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte Rechtslagen
            oder bei Änderungen unseres Dienstes anzupassen. Die jeweils aktuelle Version finden Sie
            stets auf dieser Seite. Bei wesentlichen Änderungen werden wir Sie gesondert informieren.
          </p>
        </Section>

        {/* ═══ BACK LINK ═══ */}
        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <Link to="/" className="text-[#0a84ff] text-sm hover:underline">← Zurück zur Startseite</Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper ─── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h3 className="text-lg font-semibold text-white/[0.92] mb-4">{title}</h3>
      <div className="text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}
