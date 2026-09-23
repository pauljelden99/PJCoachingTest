/**
 * Begriffsliste fuer den Glossar-Tab (app/glossar/page.tsx). Fasst die
 * Fachbegriffe zusammen, die an anderer Stelle in der App bereits
 * verwendet, aber nicht immer erklaert werden - Definitionen/Quellen
 * gespiegelt aus den jeweiligen Berechnungs-Modulen (siehe Kommentare je
 * Eintrag) statt neu erfunden, damit Glossar und tatsaechliche
 * Berechnung nicht auseinanderlaufen.
 *
 * `sourceUrl`/`sourceLabel`: Verweis auf die Originalliteratur, sofern frei
 * zugaenglich (z.B. per DOI/PubMed); sonst ersatzweise eine erklaerende
 * wissenschaftliche/fachliche Seite zum Thema (siehe jeweiliger Kommentar).
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
  sourceUrl: string;
  sourceLabel: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "GA1 (Grundlagenausdauer 1)",
    definition:
      "Lockeres, aerobes Grundlagentempo - alles langsamer als die Schwellenpace-Zonengrenze. Basis des Trainingsumfangs.",
    // Kein Einzelbegriff mit eigener Originalquelle - Seiler begruendet das
    // zugrundeliegende Zonenmodell (polarisiertes Training), auf dem GA1
    // als "niedrige Intensitaet" aufbaut.
    sourceUrl: "https://doi.org/10.1123/ijspp.5.3.276",
    sourceLabel: "Seiler (2010), International Journal of Sports Physiology and Performance",
  },
  {
    term: "Schwelle (Tempolauf)",
    definition:
      "Trainingszone rund um die (anaerobe) Schwellenpace - die Pace, die über ca. 1 Stunde maximal gehalten werden kann. Grenzen werden aus Wettkampfzeiten oder Feldtests abgeleitet (siehe Tempozonen im Profil).",
    // Kein einzelnes Originalpapier fest als "die" Schwellendefinition
    // etabliert - daher die erklaerende Uebersicht statt einer Einzelquelle.
    sourceUrl: "https://en.wikipedia.org/wiki/Lactate_threshold",
    sourceLabel: "Wikipedia: Lactate threshold",
  },
  {
    term: "VO2max-Zone",
    definition:
      "Hochintensive Zone nahe der maximalen Sauerstoffaufnahme (VO2max) - schneller als die Schwellenpace-Zonengrenze, typischerweise für 3-5-minütige Intervalle.",
    sourceUrl: "https://doi.org/10.1093/qjmed/os-16.62.135",
    sourceLabel: "Hill & Lupton (1923), QJM: An International Journal of Medicine",
  },
  {
    term: "VDOT / effektiver VO2max",
    definition:
      "Kennzahl nach der Daniels-Gilbert-VDOT-Formel (Daniels' Running Formula), die eine Trainings- oder Wettkampfleistung in einen vergleichbaren VO2max-Wert umrechnet - Grundlage der Trainingspace-Zonen (Jack Daniels) und der VO2max-Zeitreihe im Dashboard.",
    // Die Originalquelle (Daniels/Gilbert, "Oxygen Power: Performance
    // Tables for Distance Runners", 1979) ist ein vergriffenes Buch ohne
    // freie Online-Fassung/DOI - daher die erklaerende Seite zur Herkunft
    // der Tabellen/Formel.
    sourceUrl: "http://www.simpsonassociatesinc.com/oxypwr.html",
    sourceLabel: "Simpson Associates: Oxygen Power (Daniels/Gilbert)",
  },
  {
    term: "Karvonen-Methode (%HFR)",
    definition:
      "Berechnet Herzfrequenzzonen relativ zur Herzfrequenzreserve: %HFR = (HF − Ruhepuls) / (Maxpuls − Ruhepuls). Karvonen, Kentala & Mustala (1957).",
    // Original (Annales Medicinae Experimentalis et Biologiae Fenniae,
    // 1957) ohne freie Online-Fassung/DOI - daher die erklaerende Quelle.
    sourceUrl: "https://bcmj.org/articles/science-exercise-prescription-martti-karvonen-and-his-contributions",
    sourceLabel: "British Columbia Medical Journal: Martti Karvonen and his contributions",
  },
  {
    term: "TRIMP (Training Impulse)",
    definition:
      "Herzfrequenzbasierte Kennzahl für die Trainingsbelastung einer Einheit (Banister-TRIMP, Morton et al. 1990) - eine von mehreren Quellen für die tägliche Trainingslast (daily_load).",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/2246166/",
    sourceLabel: "Morton, Fitz-Clarke & Banister (1990), Journal of Applied Physiology",
  },
  {
    term: "RPE (Rate of Perceived Exertion)",
    definition:
      "Subjektiv empfundene Anstrengung auf einer Skala von 0-10 - bei manueller Eingabe optional als Notiz erfassbar, geht aber nicht in die tägliche Trainingslast (daily_load) ein.",
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/11708692/",
    sourceLabel: "Foster et al. (2001), Journal of Strength and Conditioning Research",
  },
  {
    term: "CTL (Chronic Training Load) - „Fitness“",
    definition:
      "Exponentiell gewichteter gleitender Durchschnitt der täglichen Trainingslast über ca. 42 Tage - Teil des Performance-Management-Modells (PMC).",
    sourceUrl: "https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/",
    sourceLabel: "TrainingPeaks: The Science of the Performance Manager",
  },
  {
    term: "ATL (Acute Training Load) - „Fatigue“",
    definition: "Wie CTL, aber über ca. 7 Tage - bildet die kurzfristige Ermüdung ab.",
    sourceUrl: "https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/",
    sourceLabel: "TrainingPeaks: The Science of the Performance Manager",
  },
  {
    term: "TSB (Training Stress Balance) - „Form“",
    definition: "TSB = CTL − ATL. Positive Werte deuten auf Frische/Erholung hin, stark negative auf Ermüdung.",
    sourceUrl: "https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/",
    sourceLabel: "TrainingPeaks: The Science of the Performance Manager",
  },
  {
    term: "ACWR (Acute:Chronic Workload Ratio)",
    definition:
      "Verhältnis von ATL zu CTL als Verletzungsrisiko-Indikator (Gabbett 2016, „The training-injury prevention paradox“): < 0,8 = Unterbelastung, 0,8-1,3 = optimal, 1,3-1,5 = erhöht, > 1,5 = hohes Risiko.",
    sourceUrl: "https://doi.org/10.1136/bjsports-2015-095788",
    sourceLabel: "Gabbett (2016), British Journal of Sports Medicine",
  },
  {
    term: "Wettkampfprognose (VDOT-basiert)",
    definition:
      "Hochrechnung einer Wettkampfzeit je Distanz aus dem eff. VO2max (Jack-Daniels-VDOT) der besten Einheit der letzten 90 Tage - Umkehrung derselben Daniels-Gilbert-Formel, mit der der eff. VO2max selbst geschätzt wird.",
    sourceUrl: "http://www.simpsonassociatesinc.com/oxypwr.html",
    sourceLabel: "Simpson Associates: Oxygen Power (Daniels/Gilbert)",
  },
  {
    term: "Daniels-Zonen (Easy/Marathon/Threshold/Interval/Repetition)",
    definition:
      "Fünf Trainingspace-Zonen nach Jack Daniels, berechnet als Prozentsatz der Geschwindigkeit bei VO2max (vVO2max) aus dem VDOT-Wert.",
    sourceUrl: "http://www.simpsonassociatesinc.com/oxypwr.html",
    sourceLabel: "Simpson Associates: Oxygen Power (Daniels/Gilbert)",
  },
  {
    term: "Bakken Golden Zone",
    definition:
      "Ansatz von Marius Bakken: Schwellenintervalle werden je nach Dauer gestaffelt langsamer als die reine Schwellenpace gelaufen - kürzere Wiederholungen näher an, längere zunehmend langsamer als die Schwellenpace.",
    sourceUrl: "https://www.mariusbakken.com/double-threshold-training.html",
    sourceLabel: "Marius Bakken: Double Threshold Training in Depth",
  },
  {
    term: "Plan-Ist-Abgleich",
    definition:
      "Vergleich zwischen geplanter Einheit (Zielzone/-distanz) und den tatsächlich absolvierten Aktivitäten desselben Tages, inkl. Erfüllungsgrad in Prozent und Zonenübereinstimmung.",
    // Kein Einzelbegriff mit fest etablierter Originalquelle - Uebersichts-
    // arbeit zum Abgleich von geplanter und tatsaechlicher Trainingslast.
    sourceUrl: "https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-022-00420-3",
    sourceLabel: "Sports Medicine - Open: Internal Training Load Perceived by Athletes and Planned by Coaches",
  },
];
