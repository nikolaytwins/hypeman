"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";

type Operation = {
  jobId: string;
  step: string;
  label: string;
  startedAt: number;
  elapsedSec: number;
  parallel: number;
};

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} мин ${s} с`;
}

export default function StatusPage() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/pipeline-active");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setOps(Array.isArray(d.operations) ? d.operations : []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка запроса");
      setOps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 4000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="min-h-full bg-slate-100 px-4 py-10 text-slate-700">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300/80 pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Техническая страница</p>
            <h1 className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Activity className="h-4 w-4 text-slate-500" />
              На сервере сейчас
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Долгие шаги (ffmpeg, субтитры, озвучка, ИИ) в этом процессе Node. Обновление каждые ~4 с. При PM2 cluster
              виден только текущий воркер.
            </p>
          </div>
          <Link href="/" className="shrink-0 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
            ← студия
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : err ? (
          <p className="text-xs text-red-600">{err}</p>
        ) : ops.length === 0 ? (
          <p className="text-xs text-slate-600">Нет активных долгих операций.</p>
        ) : (
          <ul className="space-y-2 font-mono text-[11px]">
            {ops.map((op) => (
              <li key={`${op.jobId}-${op.step}-${op.startedAt}`} className="rounded border border-slate-200 bg-white/80 px-3 py-2">
                <div className="text-slate-800">{op.label}</div>
                <div className="mt-1 text-slate-500">{op.jobId}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-slate-500">
                  <span>{formatElapsed(op.elapsedSec)}</span>
                  {op.parallel > 1 ? <span>×{op.parallel}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[10px] leading-relaxed text-slate-500">
          Полная картина на VPS: <span className="font-mono">top</span>, <span className="font-mono">pm2 monit</span>.
        </p>
      </div>
    </div>
  );
}
