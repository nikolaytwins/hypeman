import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";

const log = createLogger("openrouter_audio");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function audioFormatFromPath(filePath: string): "mp3" | "wav" | "m4a" | "aac" | "flac" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return "wav";
  if (ext === ".m4a") return "m4a";
  if (ext === ".aac") return "aac";
  if (ext === ".flac") return "flac";
  return "mp3";
}

function getAudioModel(): string {
  return (
    process.env.OPENROUTER_AUDIO_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "google/gemini-2.0-flash-001"
  );
}

function extractMessageText(data: unknown): string {
  const d = data as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = d.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text?: string }).text ?? "") : ""))
      .join("")
      .trim();
  }
  return "";
}

/** Расшифровка аудио через OpenRouter (модель с входом audio), один ключ с текстовыми запросами. */
export async function transcribeWithOpenRouter(
  audioPath: string,
  mode: "plain" | "srt",
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("Не задан OPENROUTER_API_KEY для расшифровки через OpenRouter");
  }
  const buf = await fs.readFile(audioPath);
  const b64 = buf.toString("base64");
  const format = audioFormatFromPath(audioPath);
  const model = getAudioModel();

  const textInstruction =
    mode === "plain"
      ? "Дословно расшифруй речь из аудио на том языке, на котором говорят. Только текст расшифровки, без заголовков и пояснений."
      : "Расшифруй аудио и верни ТОЛЬКО валидный файл субтитров SRT: нумерация, таймкоды в формате HH:MM:SS,mmm --> HH:MM:SS,mmm, строки текста, пустая строка между блоками. Разбивка по смыслу примерно 2–7 секунд на блок. Без markdown и без пояснений до или после файла.";

  log.info("request", { model, format, mode, bytes: buf.length });

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Hypeman",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: textInstruction },
            {
              type: "input_audio",
              input_audio: {
                data: b64,
                format,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    log.error("OpenRouter audio error", { status: res.status, body: t.slice(0, 1500) });
    throw new Error(`OpenRouter (аудио): HTTP ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  const out = extractMessageText(data);
  if (!out) {
    throw new Error("OpenRouter вернул пустую расшифровку");
  }
  if (mode === "srt") {
    return out.replace(/^```(?:srt)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return out;
}

export function shouldUseOpenRouterTranscription(): boolean {
  const p = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase();
  if (p === "openrouter") return true;
  if (p === "openai" || p === "whisper") return false;
  return Boolean(process.env.OPENROUTER_API_KEY) && !process.env.OPENAI_API_KEY?.trim();
}
