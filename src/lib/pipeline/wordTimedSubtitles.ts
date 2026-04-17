import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import OpenAI from "openai";
const log = createLogger("word_timed_subtitles");

export type TimedWord = { word: string; start: number; end: number };

export type WordsToSrtOptions = {
  /** Макс. длина одной строки (символы); для вертикали 9:16 держите ~28–36. */
  maxChars?: number;
  /** Макс. длительность одного cue (с); длиннее — новая строка даже без точки. */
  maxDurSec?: number;
  /** Если пауза между словами больше этого — новый cue (сохраняет «фразу за фразой»). */
  pauseFlushSec?: number;
  /** Минимальный зазор между концом cue и началом следующего (анти-наложение в libass). */
  gapBetweenCuesSec?: number;
};

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

/** Одна визуальная строка SRT: без переносов, без лишних пробелов. */
export function singleLineCueText(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/** Конец предложения по последнему токену (RU/EN, типичный вывод Whisper). */
export function wordEndsSentence(word: string): boolean {
  const t = singleLineCueText(word);
  if (!t) return false;
  return /[.!?…]["')\]]*$/u.test(t);
}

/**
 * Сборка SRT из слов Whisper с **сохранением таймингов слов** (start/end cue = первое/последнее слово).
 *
 * Алгоритм:
 * 1. Идём по словам по порядку, буфер = будущий cue.
 * 2. Перед добавлением следующего слова: если пауза после последнего в буфере > pauseFlushSec — сброс буфера в cue (новая фраза по паузе).
 * 3. Если буфер + новое слово даёт строку длиннее maxChars ИЛИ длительность > maxDurSec — сброс, затем слово в новый буфер (жёсткая одна строка на экран).
 * 4. После добавления слова: если оно заканчивает предложение (. ! ? …) — сброс (одна строка ≈ одно предложение, пока влезает в maxChars).
 * 5. Текст cue = `join` слов через пробел, **без** `\n` (иначе libass показывает несколько строк сразу).
 * 6. Постобработка: если end[i] > start[i+1] − gap — подрезаем end[i], чтобы cue не пересекались (иначе «простыня»).
 *
 * Почему «Whisper правильный, а на видео нет»: часто ломает не Whisper, а (а) склейка слов в слишком длинные cue,
 * (б) переносы внутри одного cue, (в) пересечение интервалов → несколько субтитров одновременно.
 */
export function wordsToSrt(words: TimedWord[], opts?: WordsToSrtOptions): string {
  const maxChars = opts?.maxChars ?? 34;
  const maxDurSec = opts?.maxDurSec ?? 4.2;
  const pauseFlushSec = opts?.pauseFlushSec ?? 0.42;
  const gap = opts?.gapBetweenCuesSec ?? 0.04;

  const cleaned = words
    .map((w) => ({
      word: singleLineCueText(w.word ?? ""),
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
    const text = singleLineCueText(buf.map((b) => b.word).join(" "));
    if (text) cues.push({ start, end, text });
    buf = [];
  };

  for (const w of cleaned) {
    if (!buf.length) {
      buf.push(w);
      if (wordEndsSentence(w.word)) flush();
      continue;
    }

    const last = buf[buf.length - 1];
    const pause = w.start - last.end;
    if (pause > pauseFlushSec) {
      flush();
      buf.push(w);
      if (wordEndsSentence(w.word)) flush();
      continue;
    }

    const nextText = singleLineCueText([...buf.map((b) => b.word), w.word].join(" "));
    const nextDur = w.end - buf[0].start;
    if (nextText.length > maxChars || nextDur > maxDurSec) {
      flush();
      buf.push(w);
      if (wordEndsSentence(w.word)) flush();
      continue;
    }

    buf.push(w);
    if (wordEndsSentence(w.word)) flush();
  }
  flush();

  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    const nextStart = cues[i + 1].start;
    const maxEnd = nextStart - gap;
    if (cues[i].end > maxEnd) {
      cues[i].end = Math.max(cues[i].start + gap, maxEnd);
    }
  }

  const minDur = 0.03;
  return cues
    .map((c, i) => {
      const end = Math.max(c.end, c.start + minDur);
      return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(end)}\n${c.text}\n`;
    })
    .join("\n");
}

function parseSubtitleEnvInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseSubtitleEnvFloat(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("no_openai");
  return new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL });
}

/** Локальный faster-whisper (Python FastAPI). Нужен `WHISPER_SERVICE_URL` и запущенный `npm run whisper`. */
async function transcribeWithLocalWhisper(
  audioFilePath: string,
  baseUrl: string,
): Promise<TimedWord[]> {
  const root = baseUrl.replace(/\/$/, "");
  const resolved = path.resolve(audioFilePath);
  const language = process.env.WHISPER_LANGUAGE?.trim() || "ru";
  const response = await fetch(`${root}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_path: resolved, language }),
  });
  if (!response.ok) {
    const t = await response.text().catch(() => "");
    throw new Error(`Whisper service error: ${response.status} ${t.slice(0, 400)}`);
  }
  const data = (await response.json()) as {
    words?: Array<{ word?: string; start?: number; end?: number }>;
  };
  const words = data.words;
  if (!Array.isArray(words) || !words.length) {
    throw new Error("Локальный Whisper не вернул words[]");
  }
  const out: TimedWord[] = [];
  for (const w of words) {
    const word = String(w.word ?? "").trim();
    const start = Number(w.start);
    const end = Number(w.end);
    if (!word || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ word, start, end });
  }
  if (!out.length) throw new Error("пустой words после локального Whisper");
  log.info("local_whisper_words", { count: out.length });
  return out;
}

function whisperServiceBaseUrl(): string | null {
  const u = process.env.WHISPER_SERVICE_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return null;
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

/** Длинный сегмент от модели режем на строки ≤ maxChars; время режем пропорционально длине текста (грубо, лучше чем одна простыня). */
function splitLongSegment(seg: JsonSeg, maxChars: number): JsonSeg[] {
  const text = singleLineCueText(seg.text);
  if (!text) return [];
  if (text.length <= maxChars) return [{ start: seg.start, end: seg.end, text }];
  const words = text.split(" ");
  const chunks: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      chunks.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) chunks.push(line);
  const lens = chunks.map((c) => c.length);
  const totalChars = lens.reduce((a, b) => a + b, 0);
  const span = Math.max(seg.end - seg.start, 0.08);
  const out: JsonSeg[] = [];
  let t = seg.start;
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const chunkDur = isLast ? seg.end - t : Math.max(0.06, span * (lens[i] / totalChars));
    const end = isLast ? seg.end : t + chunkDur;
    out.push({ start: t, end: Math.max(t + 0.04, end), text: chunks[i] });
    t = end;
  }
  return out;
}

export function segmentsToSrt(segments: JsonSeg[], maxChars = 34): string {
  const flat = segments.flatMap((s) => splitLongSegment(s, maxChars));
  flat.sort((a, b) => a.start - b.start);
  const gap = 0.04;
  for (let i = 0; i < flat.length - 1; i++) {
    const maxEnd = flat[i + 1].start - gap;
    if (flat[i].end > maxEnd) flat[i].end = Math.max(flat[i].start + gap, maxEnd);
  }
  return flat
    .map((c, i) => {
      const end = Math.max(c.end, c.start + 0.04);
      return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(end)}\n${c.text}\n`;
    })
    .join("\n");
}

/** Пайплайн: локальный faster-whisper (если WHISPER_SERVICE_URL) → иначе OpenAI words → SRT; иначе OpenRouter JSON → SRT; иначе throw (вызывающий сделает fallback). */
export async function buildSyncedSrtFromAudio(audioPath: string): Promise<string> {
  const lineMax = parseSubtitleEnvInt("SUBTITLE_LINE_MAX_CHARS", 34);
  const cueMaxSec = parseSubtitleEnvFloat("SUBTITLE_CUE_MAX_SEC", 4.2);
  const pauseFlush = parseSubtitleEnvFloat("SUBTITLE_PAUSE_FLUSH_SEC", 0.42);
  const cueGap = parseSubtitleEnvFloat("SUBTITLE_GAP_BETWEEN_CUES_SEC", 0.04);

  const wordSrtOpts = {
    maxChars: lineMax,
    maxDurSec: cueMaxSec,
    pauseFlushSec: pauseFlush,
    gapBetweenCuesSec: cueGap,
  };

  const localBase = whisperServiceBaseUrl();
  if (localBase) {
    try {
      const words = await transcribeWithLocalWhisper(audioPath, localBase);
      return wordsToSrt(words, wordSrtOpts);
    } catch (e) {
      log.warn("local_whisper_failed", { message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const words = await transcribeWordsOpenAI(audioPath);
      return wordsToSrt(words, wordSrtOpts);
    } catch (e) {
      log.warn("openai_words_failed", { message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const segs = await transcribeSegmentsOpenRouter(audioPath);
      return segmentsToSrt(segs, lineMax);
    } catch (e) {
      log.warn("openrouter_segments_failed", { message: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new Error("sync_srt_unavailable");
}
