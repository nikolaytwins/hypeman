import type { Logger } from "@/lib/logger";

export interface Scene {
  id: number;
  durationHintSec: number;
  narration: string;
  visualHint?: string;
}

export interface ScriptPayload {
  title: string;
  scenes: Scene[];
  rawText?: string;
}

export function parseScriptJson(text: string, log: Logger): ScriptPayload {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as ScriptPayload;
  if (!parsed?.scenes || !Array.isArray(parsed.scenes)) {
    log.error("Некорректная структура JSON сценария");
    throw new Error("Некорректный сценарий: нет массива scenes");
  }
  parsed.scenes = parsed.scenes.map((s, i) => ({
    id: typeof s.id === "number" ? s.id : i + 1,
    durationHintSec: typeof s.durationHintSec === "number" ? s.durationHintSec : 5,
    narration: String(s.narration ?? ""),
    visualHint: s.visualHint ? String(s.visualHint) : undefined,
  }));
  if (!parsed.title) parsed.title = "Без названия";
  return parsed;
}

export function scriptToPlainText(script: ScriptPayload): string {
  return script.scenes.map((s) => s.narration).join("\n\n");
}
