// Platzhalter-Impressum bis zur Anbieterkennzeichnung nach § 5 TMG /
// Art. 13 DSGVO mit den echten Angaben - bewusst ohne RouteGuard, damit
// die Seite auch ohne Login erreichbar ist (Pflichtangabe, siehe Footer.tsx).
export default function ImpressumPage() {
  return (
    <main className="page max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Impressum</h1>
      <div className="card space-y-4 text-sm text-mist">
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">Angaben gemäß § 5 TMG</h2>
          <p>
            Max Mustermann
            <br />
            Musterstraße 1
            <br />
            12345 Musterstadt
            <br />
            Deutschland
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">Kontakt</h2>
          <p>
            Telefon: +49 123 4567890
            <br />
            E-Mail: kontakt@lauftrainer-app.example
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
          <p>
            Max Mustermann
            <br />
            Musterstraße 1, 12345 Musterstadt
          </p>
        </section>
        <p className="text-xs text-mist/70">
          Dies ist ein Platzhaltertext. Die tatsächlichen Anbieterangaben werden vor dem produktiven Betrieb ergänzt.
        </p>
      </div>
    </main>
  );
}
