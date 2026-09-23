// Platzhalter-Datenschutzerklaerung bis zur rechtlich geprueften Fassung
// (Art. 13/14 DSGVO) mit den echten Angaben - bewusst ohne RouteGuard,
// damit die Seite auch ohne Login erreichbar ist (siehe Footer.tsx).
export default function DatenschutzPage() {
  return (
    <main className="page max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Datenschutzerklärung</h1>
      <div className="card space-y-4 text-sm text-mist">
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">1. Verantwortlicher</h2>
          <p>
            Max Mustermann, Musterstraße 1, 12345 Musterstadt
            <br />
            E-Mail: kontakt@lauftrainer-app.example
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">2. Verarbeitete Daten</h2>
          <p>
            Im Rahmen der Nutzung dieser Anwendung werden u. a. Konto- und Kontaktdaten (Name, E-Mail-Adresse)
            sowie Trainings- und Gesundheitsdaten (z. B. Aktivitäten, Herzfrequenz, Wellness-Werte) verarbeitet.
          </p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">3. Zweck der Verarbeitung</h2>
          <p>Die Daten dienen der Trainingsplanung, -protokollierung und -auswertung durch dich und deinen Trainer.</p>
        </section>
        <section>
          <h2 className="mb-1 text-sm font-medium text-ink">4. Deine Rechte</h2>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung deiner
            personenbezogenen Daten sowie auf Datenübertragbarkeit und Widerspruch. Wende dich hierzu an die oben
            genannte Kontaktadresse.
          </p>
        </section>
        <p className="text-xs text-mist/70">
          Dies ist ein Platzhaltertext. Die tatsächliche, rechtlich geprüfte Datenschutzerklärung wird vor dem
          produktiven Betrieb ergänzt.
        </p>
      </div>
    </main>
  );
}
