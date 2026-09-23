"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// Analyse ist in das Dashboard eingezogen - alte Links/Bookmarks auf
// /analytics werden unter Beibehaltung der Query-Parameter dorthin
// weitergeleitet.
function AnalyticsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  }, [router, searchParams]);

  return <main className="p-6 text-mist">Lädt...</main>;
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
      <AnalyticsRedirect />
    </Suspense>
  );
}
