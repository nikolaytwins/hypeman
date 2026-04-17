import { createLogger } from "@/lib/logger";
import { completeChat } from "@/lib/openrouter";
import { IMAGE_DIRECTOR_PROMPT } from "@/lib/prompts/imageDirectorPrompt";
import { parseScriptJson, type ScriptPayload } from "@/lib/pipeline/types";

const log = createLogger("adapt_script");

const SYSTEM = `Ты переписываешь вирусные сценарии короткого видео под личный бренд на русском языке.
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
- Сохрани структуру: число сцен и темп как у исходника.
- Сохрани вирусные приёмы (хук, петли, контраст, CTA), но сделай формулировки уникальными.
- narration — только озвучка на русском (~5 с на сцену).
- visualHint — готовый промпт для Midjourney на английском строго по правилам ниже (одна строка, без текста в кадре).

--- Правила только для поля visualHint ---
${IMAGE_DIRECTOR_PROMPT}`;

export async function adaptScript(originalTranscript: string): Promise<ScriptPayload> {
  log.info("start", { chars: originalTranscript.length });
  const user = `Исходная расшифровка / текст ролика (Reel / TikTok):\n\n${originalTranscript}\n\nПерепиши под личный бренд по инструкции выше. Только JSON.`;
  const raw = await completeChat({ system: SYSTEM, user, temperature: 0.65 });
  const script = parseScriptJson(raw, log);
  script.rawText = raw;
  log.info("done", { scenes: script.scenes.length });
  return script;
}
