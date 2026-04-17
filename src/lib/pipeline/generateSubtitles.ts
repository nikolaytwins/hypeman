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
import {
  buildSyncedSrtFromAudio,
  isLocalWhisperServiceConfigured,
} from "@/lib/pipeline/wordTimedSubtitles";

const log = createLogger("generate_subtitles");

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Не задан OPENAI_API_KEY. Для субтитров без OpenAI задайте WHISPER_SERVICE_URL и держите запущенным whisper_service (см. README), либо OPENROUTER_API_KEY.",
    );
  }
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

export async function generateSubtitles(
  jobId: string,
  options?: { audioFileName?: string },
): Promise<string> {
  const audioFileName = options?.audioFileName ?? "voice.mp3";
  const audioPath = path.join(jobAudioDir(jobId), audioFileName);
  const exists = await fs
    .access(audioPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    if (audioFileName === "voice.mp3") {
      throw new Error("Нет voice.mp3 — сначала сгенерируйте озвучку");
    }
    throw new Error(`Нет аудио ${audioFileName} — сначала извлеките дорожку из видео`);
  }
  const srtPath = path.join(jobOutputDir(jobId), "captions.srt");

  try {
    const synced = await buildSyncedSrtFromAudio(audioPath);
    if (synced.trim()) {
      await fs.writeFile(srtPath, synced, "utf8");
      log.info("saved_synced", { srtPath, bytes: Buffer.byteLength(synced, "utf8") });
      return srtPath;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "sync_srt_unavailable") {
      log.warn("synced_subtitles_failed", { message: msg });
    } else {
      log.info("synced_subtitles_skip", { reason: msg });
    }
  }

  if (shouldUseOpenRouterTranscription()) {
    log.info("openrouter_srt", { audioPath });
    const srt = await transcribeWithOpenRouter(audioPath, "srt");
    await fs.writeFile(srtPath, srt, "utf8");
    log.info("saved", { srtPath, bytes: Buffer.byteLength(srt, "utf8") });
    return srtPath;
  }

  if (isLocalWhisperServiceConfigured()) {
    throw new Error(
      "Задан WHISPER_SERVICE_URL, но субтитры со словами не получились (сервис недоступен, ошибка или пустой ответ), а OPENROUTER_API_KEY не настроен. Проверьте: `pm2 logs hypeman-whisper`, путь к аудио на диске, после правки .env — `pm2 reload hypeman --update-env`, чтобы Next видел WHISPER_SERVICE_URL.",
    );
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
