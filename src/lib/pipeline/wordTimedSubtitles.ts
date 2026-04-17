import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import OpenAI from "openai";
const log = createLogger("word_timed_subtitles");

export type TimedWord = { word: string; start: number; end: number };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatSrtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, "0")}`;
}

/** Склеиваем слова Whisper в блоки SRT: короткие группы ≈ слова, чтобы тайминг совпадал с озвучкой. */
export function wordsToSrt(words: TimedWord[], maxChars = 28, maxDurSec = 2.2): string {
  const cleaned = words
    .map((w) => ({
      word: (w.word ?? "").replace(/\s+/g, " ").trim(),
      start: w.start,
      end: w.end,
    }))
    .filter((w) => w.word.length > 0 && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);

  if (!cleaned.length) return "";

  const cues: { start: number; end: number; text: string }[] = [];
  let buf: TimedWord[] = [];

  const flush = () => {
    if (!buf.length) return;
    const start = buf[0].start;
    const end = buf[buf.length - 1].end;
    const text = buf.map((b) => b.word).join(" ").replace(/\s+/g, " ").trim();
    if (text) cues.push({ start, end, text });
    buf = [];
  };

  for (const w of cleaned) {
    if (!buf.length) {
      buf.push(w);
      continue;
    }
    const nextText = [...buf.map((b) => b.word), w.word].join(" ");
    const nextDur = w.end - buf[0].start;
    if (nextText.length > maxChars || nextDur > maxDurSec) {
      flush();
      buf.push(w);
    } else {
      buf.push(w);
    }
  }
  flush();

  return cues
    .map((c, i) => {
      const gap = 0.02;
      const end = Math.max(c.end, c.start + gap);
      return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(end)}\n${c.text}\n`;
    })
    .join("\n");
}

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("no_openai");
  return new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL });
}

/** Словарные таймкоды OpenAI Whisper (лучший синк с дорожкой). */
export async function transcribeWordsOpenAI(audioPath: string): Promise<TimedWord[]> {
  const openai = getOpenAI();
  const result = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: process.env.WHISPER_MODEL ?? "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const raw = result as unknown as {
    words?: Array<{ word?: string; start?: number; end?: number }>;
  };
  const words = raw.words;
  if (!Array.isArray(words) || !words.length) {
    throw new Error("OpenAI Whisper не вернул words[]");
  }
  const out: TimedWord[] = [];
  for (const w of words) {
    const word = String(w.word ?? "").trim();
    const start = Number(w.start);
    const end = Number(w.end);
    if (!word || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ word, start, end });
  }
  if (!out.length) throw new Error("пустой words после разбора");
  log.info("openai_words", { count: out.length });
  return out;
}

type JsonSeg = { start: number; end: number; text: string };

function parseJsonSegments(text: string): JsonSeg[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const arr = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(arr)) throw new Error("не массив");
  const segs: JsonSeg[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const start = Number(o.start);
    const end = Number(o.end);
    const t = String(o.text ?? "").trim();
    if (!t || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    segs.push({ start, end, text: t });
  }
  if (!segs.length) throw new Error("нет сегментов");
  segs.sort((a, b) => a.start - b.start);
  return segs;
}

/** OpenRouter: просим строгий JSON с таймкодами фраз (лучше произвольного SRT). */
export async function transcribeSegmentsOpenRouter(audioPath: string): Promise<JsonSeg[]> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("no_openrouter");

  const buf = await fs.readFile(audioPath);
  const b64 = buf.toString("base64");
  const ext = path.extname(audioPath).toLowerCase();
  const format = ext === ".wav" ? "wav" : ext === ".m4a" ? "m4a" : "mp3";
  const model =
    process.env.OPENROUTER_AUDIO_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "google/gemini-2.0-flash-001";

  const instruction = `Listen to the audio and return ONLY a JSON array (no markdown, no keys outside array):
[{"start":0.0,"end":1.2,"text":"точная фраза как слышно"}, ...]
Rules:
- start/end are seconds (float), inclusive timing aligned to speech.
- text: exact spoken words in the same language as the audio, short phrases ~0.6–3.5 s each.
- Cover the full audio; last segment end must match audio end within ~0.3s.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Hypeman",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "input_audio", input_audio: { data: b64, format } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenRouter JSON сегменты: HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("пустой ответ OpenRouter");
  const segs = parseJsonSegments(content);
  log.info("openrouter_segments", { count: segs.length });
  return segs;
}

export function segmentsToSrt(segments: JsonSeg[]): string {
  return segments
    .map((c, i) => {
      const end = Math.max(c.end, c.start + 0.04);
      return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(end)}\n${c.text}\n`;
    })
    .join("\n");
}

/** Пайплайн: OpenAI words → SRT; иначе OpenRouter JSON → SRT; иначе throw (вызывающий сделает fallback). */
export async function buildSyncedSrtFromAudio(audioPath: string): Promise<string> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const words = await transcribeWordsOpenAI(audioPath);
      return wordsToSrt(words);
    } catch (e) {
      log.warn("openai_words_failed", { message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const segs = await transcribeSegmentsOpenRouter(audioPath);
      return segmentsToSrt(segs);
    } catch (e) {
      log.warn("openrouter_segments_failed", { message: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new Error("sync_srt_unavailable");
}
