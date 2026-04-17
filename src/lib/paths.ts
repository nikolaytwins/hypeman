import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FONTS_DIR = path.join(ROOT, "fonts");

/** Каталог со шрифтами для libass: только если там есть .ttf/.otf (woff не подходит). */
export function subtitleFontsDirFromEnv(): string | null {
  const env = process.env.SUBTITLE_FONTS_DIR?.trim();
  if (!env) return null;
  return path.isAbsolute(env) ? env : path.join(ROOT, env);
}

/** `fonts/BebasNeue-Regular.ttf` — при наличии используется для сжигания субтитров. */
export function customBebasTtfPath(): string {
  return path.join(FONTS_DIR, "BebasNeue-Regular.ttf");
}

function firstFontFileInDir(dir: string): string | null {
  let names: string[] = [];
  try {
    names = fsSync.readdirSync(dir);
  } catch {
    return null;
  }
  const hit = names.find((f) => {
    const l = f.toLowerCase();
    return l.endsWith(".ttf") || l.endsWith(".otf");
  });
  return hit ? path.join(dir, hit) : null;
}

function defaultFontNameFromFile(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[-_]+/g, " ");
}

/**
 * libass в ffmpeg ожидает TTF/OTF в fontsdir. Без своего файла — системный шрифт (Arial: кириллица на macOS/Windows).
 * Положите любой .ttf в `fonts/` или задайте SUBTITLE_FONT_FILE / SUBTITLE_FONTS_DIR.
 */
export function resolvedSubtitleFontSetup(): { fontsdir: string | null; fontname: string } {
  const envName = process.env.SUBTITLE_FONT_NAME?.trim();

  const fileFromEnv = process.env.SUBTITLE_FONT_FILE?.trim();
  if (fileFromEnv) {
    const abs = path.isAbsolute(fileFromEnv) ? fileFromEnv : path.join(ROOT, fileFromEnv);
    if (fsSync.existsSync(abs)) {
      return { fontsdir: path.dirname(abs), fontname: envName || defaultFontNameFromFile(abs) };
    }
  }

  const bebas = customBebasTtfPath();
  if (fsSync.existsSync(bebas)) {
    return { fontsdir: path.dirname(bebas), fontname: envName || "Bebas Neue" };
  }

  const inFonts = firstFontFileInDir(FONTS_DIR);
  if (inFonts) {
    return { fontsdir: FONTS_DIR, fontname: envName || defaultFontNameFromFile(inFonts) };
  }

  const fromEnvDir = subtitleFontsDirFromEnv();
  if (fromEnvDir && fsSync.existsSync(fromEnvDir)) {
    const f = firstFontFileInDir(fromEnvDir);
    if (f) return { fontsdir: fromEnvDir, fontname: envName || defaultFontNameFromFile(f) };
  }

  return { fontsdir: null, fontname: envName || "Arial" };
}

export const STORAGE = {
  root: path.join(ROOT, "storage"),
  input: path.join(ROOT, "storage", "input"),
  audio: path.join(ROOT, "storage", "audio"),
  scenes: path.join(ROOT, "storage", "scenes"),
  output: path.join(ROOT, "storage", "output"),
} as const;

export async function ensureStorageDirs(): Promise<void> {
  await fs.mkdir(STORAGE.input, { recursive: true });
  await fs.mkdir(STORAGE.audio, { recursive: true });
  await fs.mkdir(STORAGE.scenes, { recursive: true });
  await fs.mkdir(STORAGE.output, { recursive: true });
}

export function jobInputDir(jobId: string) {
  return path.join(STORAGE.input, jobId);
}

export function jobAudioDir(jobId: string) {
  return path.join(STORAGE.audio, jobId);
}

export function jobScenesDir(jobId: string) {
  return path.join(STORAGE.scenes, jobId);
}

export function jobOutputDir(jobId: string) {
  return path.join(STORAGE.output, jobId);
}

export async function ensureJobDirs(jobId: string): Promise<void> {
  await fs.mkdir(jobInputDir(jobId), { recursive: true });
  await fs.mkdir(jobAudioDir(jobId), { recursive: true });
  await fs.mkdir(jobScenesDir(jobId), { recursive: true });
  await fs.mkdir(jobOutputDir(jobId), { recursive: true });
}
