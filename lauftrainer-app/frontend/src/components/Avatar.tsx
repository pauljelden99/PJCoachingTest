function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Gemeinsame Anzeige-Komponente fuer das Profilbild (Navbar, Profilseite) -
// faellt ohne gesetztes Bild auf ein Kuerzel-Icon aus dem Namen zurueck,
// statt einen generischen Platzhalter oder eine leere Flaeche zu zeigen.
export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- Data-URL, kein optimierbares next/image-Asset
    return <img src={src} alt={name} style={style} className="rounded-full object-cover" />;
  }
  return (
    <span
      style={style}
      className="flex items-center justify-center rounded-full bg-moss/15 font-medium text-moss"
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
