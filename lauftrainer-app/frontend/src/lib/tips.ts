export interface RunningTip {
  title: string;
  body: string;
}

// Inhalte werden vom Trainer separat nachgetragen (noch nicht Teil dieser
// Aenderung) - das Tab und die Seite stehen bereits, die Liste bleibt bis
// dahin leer (siehe TipsContent in app/tipps/page.tsx fuer die
// Leer-Zustand-Anzeige).
export const RUNNING_TIPS: RunningTip[] = [];
