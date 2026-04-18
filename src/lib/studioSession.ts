import type { ScriptPayload } from "@/lib/pipeline/types";

export type Origin = "new" | "adapt" | "subs";

export type Screen =
  | "pick"
  | "new_topic"
  | "new_script"
  | "adapt_upload"
  | "adapt_transcribe"
  | "adapt_rewrite"
  | "subs_upload"
  | "subs_burn"
  | "subs_review"
  | "voice"
  | "scenes"
  | "render"
  | "render_review"
  | "done";

export const STUDIO_DRAFT_KEY = "hypeman-studio-draft-v1";
export const LAST_REEL_JOB_KEY = "hypeman-last-reel-job-id";

export const SESSION_FILE = "studio-session.json";

const ALL_SCREENS: Screen[] = [
  "pick",
  "new_topic",
  "new_script",
  "adapt_upload",
  "adapt_transcribe",
  "adapt_rewrite",
  "subs_upload",
  "subs_burn",
  "subs_review",
  "voice",
  "scenes",
  "render",
  "render_review",
  "done",
];

export type ReelListItem = {
  jobId: string;
  title: string;
  updatedAt: number;
  hasSession: boolean;
  /** Из studio-session.json — шаг пайплайна. */
  screen?: Screen;
  savedAt?: number;
  renderProgress?: number;
};

export type StudioDraftV1 = {
  v: 1;
  savedAt: number;
  jobId: string;
  origin: Origin | null;
  screen: Screen;
  topic: string;
  script: ScriptPayload | null;
  transcript: string;
  sceneFileNames: string[];
  sourceReady: boolean;
  renderProgress: number;
};

export type StudioStateSnapshot = {
  jobId: string;
  origin: Origin | null;
  screen: Screen;
  topic: string;
  script: ScriptPayload | null;
  transcript: string;
  sceneFileNames: string[];
  sourceReady: boolean;
  renderProgress: number;
};

export function isValidJobId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{6,48}$/.test(id);
}

/** Черновик UI: в sessionStorage — отдельная задача в каждой вкладке (параллельные сессии). */
export function readStudioDraftRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const s = sessionStorage.getItem(STUDIO_DRAFT_KEY);
    if (s) return s;
    const legacy = localStorage.getItem(STUDIO_DRAFT_KEY);
    if (legacy) {
      sessionStorage.setItem(STUDIO_DRAFT_KEY, legacy);
      localStorage.removeItem(STUDIO_DRAFT_KEY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStudioDraftRaw(json: string): void {
  try {
    sessionStorage.setItem(STUDIO_DRAFT_KEY, json);
  } catch {
    /* ignore */
  }
}

export function clearStudioDraft() {
  try {
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
    localStorage.removeItem(STUDIO_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function setLastReelJobId(jobId: string) {
  try {
    if (isValidJobId(jobId)) localStorage.setItem(LAST_REEL_JOB_KEY, jobId);
  } catch {
    /* ignore */
  }
}

export function coerceScreen(value: unknown, hasScript: boolean): Screen {
  if (typeof value === "string" && (ALL_SCREENS as string[]).includes(value)) {
    return value as Screen;
  }
  return hasScript ? "new_script" : "pick";
}

export function coerceOrigin(value: unknown): Origin | null {
  if (value === "new" || value === "adapt" || value === "subs") return value;
  return null;
}

export function draftHasWork(d: Partial<StudioDraftV1>): boolean {
  const script = d.script;
  const hasScript = Boolean(script && Array.isArray(script.scenes) && script.scenes.length > 0);
  const screen = d.screen;
  const midFlow =
    screen === "new_topic" ||
    screen === "new_script" ||
    screen === "adapt_upload" ||
    screen === "adapt_transcribe" ||
    screen === "adapt_rewrite" ||
    screen === "subs_upload" ||
    screen === "subs_burn" ||
    screen === "subs_review" ||
    screen === "voice" ||
    screen === "scenes" ||
    screen === "render" ||
    screen === "render_review";
  return (
    midFlow ||
    screen === "done" ||
    hasScript ||
    Boolean(d.topic?.trim()) ||
    Boolean(d.transcript?.trim()) ||
    Boolean(d.sceneFileNames?.length) ||
    Boolean(d.sourceReady)
  );
}

export function scriptFromUnknown(raw: unknown): ScriptPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ScriptPayload;
  if (!Array.isArray(o.scenes) || !o.scenes.length) return null;
  const ok = o.scenes.every((s) => s && typeof s.id === "number" && typeof s.narration === "string");
  return ok ? o : null;
}

/** Поля списка рилсов из JSON сессии (без полной валидации черновика). */
export function readSessionListFields(raw: unknown): {
  title?: string;
  screen?: Screen;
  savedAt?: number;
  renderProgress?: number;
} {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const script = scriptFromUnknown(o.script);
  const rawScript = o.script;
  let title: string | undefined = script?.title?.trim();
  if (!title && rawScript && typeof rawScript === "object" && "title" in rawScript) {
    const t = (rawScript as { title?: unknown }).title;
    if (typeof t === "string" && t.trim()) title = t.trim();
  }
  const screen = coerceScreen(o.screen, Boolean(script));
  const savedAt = typeof o.savedAt === "number" ? o.savedAt : undefined;
  const renderProgress = typeof o.renderProgress === "number" ? o.renderProgress : undefined;
  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  if (!title && topic) title = topic;
  return { title, screen, savedAt, renderProgress };
}

/** Разбор тела PUT или файла studio-session.json */
export function parseStudioDraftBody(body: unknown): StudioDraftV1 | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Partial<StudioDraftV1>;
  if (b.v !== 1 || typeof b.jobId !== "string" || !isValidJobId(b.jobId)) return null;
  const script = scriptFromUnknown(b.script);
  const screen = coerceScreen(b.screen, Boolean(script));
  return {
    v: 1,
    savedAt: typeof b.savedAt === "number" ? b.savedAt : Date.now(),
    jobId: b.jobId,
    origin: coerceOrigin(b.origin),
    screen,
    topic: typeof b.topic === "string" ? b.topic : "",
    script,
    transcript: typeof b.transcript === "string" ? b.transcript : "",
    sceneFileNames: Array.isArray(b.sceneFileNames)
      ? b.sceneFileNames.filter((x): x is string => typeof x === "string")
      : [],
    sourceReady: Boolean(b.sourceReady),
    renderProgress: typeof b.renderProgress === "number" ? b.renderProgress : 0,
  };
}

/** Нормализация черновика из sessionStorage / API в состояние экрана. */
export function snapshotFromDraft(d: Partial<StudioDraftV1>): StudioStateSnapshot | null {
  if (d.v !== 1 || typeof d.jobId !== "string" || !d.jobId || !draftHasWork(d)) return null;
  const hasScript =
    Boolean(d.script?.scenes?.length) &&
    d.script!.scenes.every((s) => s && typeof s.id === "number" && typeof s.narration === "string");
  const script = hasScript ? (d.script as ScriptPayload) : null;
  let screen = coerceScreen(d.screen, Boolean(script));
  if (
    !script &&
    d.origin !== "subs" &&
    (screen === "voice" || screen === "scenes" || screen === "render" || screen === "render_review")
  ) {
    screen = "pick";
  }
  if (!script && screen === "new_script") {
    if (d.origin === "adapt") screen = "adapt_rewrite";
    else if (d.origin === "subs") {
      if (!d.sourceReady) screen = "subs_upload";
      else if (d.screen === "subs_review") screen = "subs_review";
      else screen = "subs_burn";
    } else screen = d.topic?.trim() ? "new_topic" : "pick";
  }
  return {
    jobId: d.jobId,
    origin: coerceOrigin(d.origin),
    screen,
    topic: typeof d.topic === "string" ? d.topic : "",
    script,
    transcript: typeof d.transcript === "string" ? d.transcript : "",
    sceneFileNames: Array.isArray(d.sceneFileNames) ? d.sceneFileNames.filter((x) => typeof x === "string") : [],
    sourceReady: Boolean(d.sourceReady),
    renderProgress: typeof d.renderProgress === "number" ? d.renderProgress : 0,
  };
}

export function buildDraftFromSnapshot(
  snap: StudioStateSnapshot,
  savedAt = Date.now(),
): StudioDraftV1 {
  return {
    v: 1,
    savedAt,
    jobId: snap.jobId,
    origin: snap.origin,
    screen: snap.screen,
    topic: snap.topic,
    script: snap.script,
    transcript: snap.transcript,
    sceneFileNames: snap.sceneFileNames,
    sourceReady: snap.sourceReady,
    renderProgress: snap.renderProgress,
  };
}
