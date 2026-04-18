/**
 * Учёт долгих операций в памяти процесса Node (один воркер PM2 — один Map).
 * Нужен, чтобы на UI показывать, что сервер сейчас занят ffmpeg / ИИ и т.д.
 */

type Entry = { step: string; startedAt: number; ref: number };

const state = new Map<string, Entry>();

/** Зависшие записи (процесс убит без finally): убрать старше этого. */
const STALE_MS = 50 * 60 * 1000;

export const PIPELINE_STEP_LABEL_RU: Record<string, string> = {
  "extract-audio": "Извлечение аудио (ffmpeg)",
  "merge-videos": "Склейка сцен (ffmpeg)",
  "add-audio": "Наложение озвучки (ffmpeg)",
  "burn-subtitles": "Прожиг субтитров (ffmpeg)",
  "generate-subtitles": "Речь → субтитры SRT",
  "save-captions": "Сохранение правок SRT",
  "generate-voice": "Озвучка ElevenLabs",
  transcribe: "Расшифровка в текст",
  "generate-script": "Сценарий (ИИ)",
  "adapt-script": "Адаптация сценария (ИИ)",
};

export function labelForStep(step: string): string {
  return PIPELINE_STEP_LABEL_RU[step] ?? step;
}

export function registerActive(jobId: string, step: string): void {
  const cur = state.get(jobId);
  state.set(jobId, {
    step,
    startedAt: cur?.startedAt ?? Date.now(),
    ref: (cur?.ref ?? 0) + 1,
  });
}

export function unregisterActive(jobId: string): void {
  const cur = state.get(jobId);
  if (!cur) return;
  if (cur.ref <= 1) state.delete(jobId);
  else state.set(jobId, { ...cur, ref: cur.ref - 1 });
}

export type ActiveOperationRow = {
  jobId: string;
  step: string;
  label: string;
  startedAt: number;
  elapsedSec: number;
  parallel: number;
};

export function listActiveOperations(): ActiveOperationRow[] {
  const now = Date.now();
  const rows: ActiveOperationRow[] = [];
  for (const [jobId, v] of state) {
    if (now - v.startedAt > STALE_MS) {
      state.delete(jobId);
      continue;
    }
    rows.push({
      jobId,
      step: v.step,
      label: labelForStep(v.step),
      startedAt: v.startedAt,
      elapsedSec: Math.max(0, Math.round((now - v.startedAt) / 1000)),
      parallel: v.ref,
    });
  }
  rows.sort((a, b) => a.startedAt - b.startedAt);
  return rows;
}

export async function withActiveTracking<T>(jobId: string, step: string, fn: () => Promise<T>): Promise<T> {
  registerActive(jobId, step);
  try {
    return await fn();
  } finally {
    unregisterActive(jobId);
  }
}
