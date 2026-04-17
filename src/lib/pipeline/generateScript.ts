import { createLogger } from "@/lib/logger";
import { completeChat } from "@/lib/openrouter";
import { parseScriptJson, type ScriptPayload } from "@/lib/pipeline/types";

const log = createLogger("generate_script");

const SYSTEM = `Ты сценарист коротких вертикальных роликов (Reels / TikTok) для русскоязычной аудитории.
Верни ТОЛЬКО валидный JSON (без markdown-ограждений) в форме:
{
  "title": string,
  "scenes": Array<{
    "id": number,
    "durationHintSec": number,
    "narration": string,
    "visualHint": string
  }>
}
Правила:
- 5–8 сцен, в каждой примерно 5 секунд устной речи (коротко, ударно).
- narration — только текст озвучки на русском (без ремарок «камера», «монтаж» внутри текста).
- visualHint — готовый промпт для генератора изображений на английском (subject, lighting, style; без текста в кадре).
- Сохраняй хук, контрасты, открытые петли и призыв к действию, где уместно.`;

export async function generateScript(topic: string): Promise<ScriptPayload> {
  log.info("start", { topicPreview: topic.slice(0, 120) });
  const user = `Тема или краткое ТЗ:\n${topic}\n\nНапиши JSON-сценарий сейчас.`;
  const raw = await completeChat({ system: SYSTEM, user, temperature: 0.75 });
  const script = parseScriptJson(raw, log);
  script.rawText = raw;
  log.info("done", { scenes: script.scenes.length });
  return script;
}
