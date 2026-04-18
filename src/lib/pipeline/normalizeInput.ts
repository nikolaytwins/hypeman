import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobInputDir, jobOutputDir } from "@/lib/paths";

const log = createLogger("normalize_input");

/** HDR→SDR (zscale + tonemap), один раз на входе; дальше pipeline — SDR yuv420p. */
const HDR_TONEMAP_VF =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

async function resolveInputFileName(jobId: string, hint?: string): Promise<string> {
  if (hint) return hint;
  const dir = jobInputDir(jobId);
  const names = await fs.readdir(dir);
  const video = names.find((n) => /\.(mp4|mov|webm|mkv)$/i.test(n));
  if (!video) {
    throw new Error("В input/ нет видео — сначала загрузите исходный ролик");
  }
  return video;
}

async function statMtimeMs(filePath: string): Promise<number | null> {
  try {
    const s = await fs.stat(filePath);
    return s.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Тонмап HDR→SDR в normalized.mp4 (output/). Перекодирует видео; аудио копируется.
 */
export async function normalizeInputVideo(inputPath: string, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(
    [
      "-i",
      inputPath,
      "-vf",
      HDR_TONEMAP_VF,
      "-c:v",
      "libx264",
      "-crf",
      "23",
      "-preset",
      "fast",
      "-c:a",
      "copy",
      outputPath,
    ],
    log,
    { label: "normalize_input_video" },
  );
}

/**
 * Гарантирует `output/{jobId}/normalized.mp4` из первого видео в `input/{jobId}/`.
 * Повторный вызов пропускает перекодирование, если normalized новее исходника.
 */
export async function ensureNormalizedInputVideo(
  jobId: string,
  options?: { inputFileName?: string },
): Promise<string> {
  const fileName = await resolveInputFileName(jobId, options?.inputFileName);
  const inputPath = path.join(jobInputDir(jobId), fileName);
  const outPath = path.join(jobOutputDir(jobId), "normalized.mp4");

  const inMt = await statMtimeMs(inputPath);
  if (inMt === null) {
    throw new Error(`Нет исходного файла: ${inputPath}`);
  }
  const outMt = await statMtimeMs(outPath);
  if (outMt !== null && outMt >= inMt) {
    log.info("normalize_skip", { outPath, inMt, outMt });
    return outPath;
  }

  log.info("normalize_start", { inputPath, outPath });
  await normalizeInputVideo(inputPath, outPath);
  log.info("normalize_done", { outPath });
  return outPath;
}
