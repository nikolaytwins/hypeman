import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { createLogger } from "@/lib/logger";
import { jobAudioDir, jobOutputDir } from "@/lib/paths";
import {
  shouldUseOpenRouterTranscription,
  transcribeWithOpenRouter,
} from "@/lib/openrouter/audioTranscribe";

const log = createLogger("generate_subtitles");

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Не задан OPENAI_API_KEY (нужен для Whisper / субтитров)");
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

export async function generateSubtitles(jobId: string): Promise<string> {
  const audioPath = path.join(jobAudioDir(jobId), "voice.mp3");
  const exists = await fs
    .access(audioPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    throw new Error("Нет voice.mp3 — сначала сгенерируйте озвучку");
  }
  const srtPath = path.join(jobOutputDir(jobId), "captions.srt");

  if (shouldUseOpenRouterTranscription()) {
    log.info("openrouter_srt", { audioPath });
    const srt = await transcribeWithOpenRouter(audioPath, "srt");
    await fs.writeFile(srtPath, srt, "utf8");
    log.info("saved", { srtPath, bytes: Buffer.byteLength(srt, "utf8") });
    return srtPath;
  }

  log.info("whisper", { audioPath });
  const openai = getOpenAI();
  const result = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: process.env.WHISPER_MODEL ?? "whisper-1",
    response_format: "srt",
  });

  const srt = typeof result === "string" ? result : String(result);
  await fs.writeFile(srtPath, srt, "utf8");
  log.info("saved", { srtPath, bytes: Buffer.byteLength(srt, "utf8") });
  return srtPath;
}

/** Расшифровка для режима «Адаптация»: Whisper или OpenRouter (если нет OpenAI). */
export async function transcribeToText(jobId: string, audioFileName: string): Promise<string> {
  const audioPath = path.join(jobAudioDir(jobId), audioFileName);

  if (shouldUseOpenRouterTranscription()) {
    log.info("openrouter_text", { audioPath });
    const text = await transcribeWithOpenRouter(audioPath, "plain");
    const out = path.join(jobOutputDir(jobId), "transcript.txt");
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, text, "utf8");
    log.info("saved_transcript", { out });
    return text;
  }

  log.info("whisper_text", { audioPath });
  const openai = getOpenAI();
  const result = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: process.env.WHISPER_MODEL ?? "whisper-1",
    response_format: "text",
  });
  const text = typeof result === "string" ? result : String(result);
  const out = path.join(jobOutputDir(jobId), "transcript.txt");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, text, "utf8");
  log.info("saved_transcript", { out });
  return text;
}
