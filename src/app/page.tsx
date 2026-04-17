import { Suspense } from "react";
import { StudioApp } from "@/components/StudioApp";

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] w-full animate-pulse rounded-2xl bg-slate-100/90" aria-hidden />}>
      <StudioApp />
    </Suspense>
  );
}
