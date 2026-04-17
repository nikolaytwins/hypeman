import fs from "node:fs";
import path from "node:path";

const FALLBACK_FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
const FALLBACK_FFPROBE = ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"];

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Путь к ffmpeg: сначала FFMPEG_PATH, затем типичные пути Homebrew (GUI-приложения часто без PATH). */
export function getFfmpegBinary(): string {
  const env = process.env.FFMPEG_PATH?.trim();
  if (env && fs.existsSync(env)) return env;
  const found = firstExisting(FALLBACK_FFMPEG);
  if (found) return found;
  return "ffmpeg";
}

/** Путь к ffprobe: FFPROBE_PATH, рядом с ffmpeg, затем типичные пути. */
export function getFfprobeBinary(): string {
  const env = process.env.FFPROBE_PATH?.trim();
  if (env && fs.existsSync(env)) return env;
  const ffmpeg = getFfmpegBinary();
  if (ffmpeg !== "ffmpeg") {
    const sibling = path.join(path.dirname(ffmpeg), "ffprobe");
    if (fs.existsSync(sibling)) return sibling;
  }
  const found = firstExisting(FALLBACK_FFPROBE);
  if (found) return found;
  return "ffprobe";
}

export function ffmpegNotFoundHint(binary: string): string {
  if (binary === "ffmpeg") {
    return "Бинарник ffmpeg не найден в PATH. Установите: brew install ffmpeg, либо задайте FFMPEG_PATH и FFPROBE_PATH в .env.local (например /opt/homebrew/bin/ffmpeg).";
  }
  return `Не удалось запустить ${binary}. Проверьте установку ffmpeg или переменные FFMPEG_PATH / FFPROBE_PATH.`;
}
