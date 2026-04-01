import { Link } from 'react-router-dom';
import { PageNav } from '../components/PageNav';

export function ImpressumPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white/[0.55] font-[var(--lp-font)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageNav />

        <h1 className="text-3xl font-semibold text-white/[0.92] mb-12">Impressum</h1>

        {/* ═══ ANGABEN GEM. §5 DDG ═══ */}
        <Section title="Angaben gemäß §5 DDG">
          <p>
            Johannes Hinkel<br/>
            Karl-Marx-Allee 64<br/>
            10243 Berlin<br/>
            Deutschland
          </p>
        </Section>

        {/* ═══ KONTAKT ═══ */}
        <Section title="Kontakt">
          <p>E-Mail: <a href="mailto:Johannes_Hinkel@icloud.com" className="text-[#0a84ff] hover:underline">Johannes_Hinkel@icloud.com</a></p>
        </Section>

        {/* ═══ VERANTWORTLICH FÜR DEN INHALT ═══ */}
        <Section title="Verantwortlich für den Inhalt nach §18 Abs. 2 MStV">
          <p>
            Johannes Hinkel<br/>
            Karl-Marx-Allee 64<br/>
            10243 Berlin
          </p>
        </Section>

        {/* ═══ EU-STREITSCHLICHTUNG ═══ */}
        <Section title="EU-Streitschlichtung">
          <p>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              className="text-[#0a84ff] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p className="mt-3">
            Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </Section>

        {/* ═══ HAFTUNGSAUSSCHLUSS ═══ */}
        <Section title="Haftung für Inhalte">
          <p>
            Als Diensteanbieter sind wir gemäß §7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten
            nach den allgemeinen Gesetzen verantwortlich. Nach §§8 bis 10 DDG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
            Tätigkeit hinweisen.
          </p>
          <p className="mt-3">
            Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den
            allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch
            erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei
            Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend
            entfernen.
          </p>
        </Section>

        {/* ═══ HAFTUNG FÜR LINKS ═══ */}
        <Section title="Haftung für Links">
          <p>
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
            Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
            Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
            Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf
            mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der
            Verlinkung nicht erkennbar.
          </p>
          <p className="mt-3">
            Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete
            Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
            Rechtsverletzungen werden wir derartige Links umgehend entfernen.
          </p>
        </Section>

        {/* ═══ URHEBERRECHT ═══ */}
        <Section title="Urheberrecht">
          <p>
            Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
            dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
            der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
            Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
          <p className="mt-3">
            © 2026 Johannes Hinkel. Alle Rechte vorbehalten.
          </p>
        </Section>

        {/* ═══ KI-HINWEIS ═══ */}
        <Section title="Hinweis zur Nutzung von KI">
          <p>
            AnkiPlus nutzt künstliche Intelligenz (KI) zur Lernunterstützung.
            KI-generierte Inhalte können Fehler enthalten und stellen keine fachliche Beratung dar.
            Weitere Informationen finden Sie in unserer{' '}
            <Link to="/datenschutz" className="text-[#0a84ff] hover:underline">Datenschutzerklärung</Link>.
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
