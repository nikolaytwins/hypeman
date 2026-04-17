import { spawn } from "node:child_process";
import type { Logger } from "@/lib/logger";
import { ffmpegNotFoundHint, getFfprobeBinary, getFfmpegBinary } from "@/lib/ffmpeg/binaries";

/**
 * iPhone HDR (HLG, arib-std-b67 / BT.2020) → SDR BT.709 перед scale/libx264/subtitles.
 * Должен быть первым в цепочке `-vf`, до `subtitles=`.
 * Для Dolby Vision (PQ) может понадобиться другой `transferin` (например smpte2084).
 */
export const FFMPEG_HDR_TO_SDR_ZSCALE =
  "zscale=transferin=arib-std-b67:transfer=bt709:primariesin=bt2020:primaries=bt709:matrixin=bt2020nc:matrix=bt709,format=yuv420p";

/** Добавить HDR→SDR в начало цепочки фильтров (через запятую). */
export function prependHdrToSdrToVideoFilterChain(rest: string): string {
  return `${FFMPEG_HDR_TO_SDR_ZSCALE},${rest}`;
}

export async function ffprobeDuration(filePath: string, log: Logger): Promise<number> {
  const ffprobeBin = getFfprobeBinary();
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];
    log.debug("ffprobe", { bin: ffprobeBin, args });
    const proc = spawn(ffprobeBin, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ENOENT")) {
        reject(new Error(ffmpegNotFoundHint(ffprobeBin)));
        return;
      }
      reject(e);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe завершился с кодом ${code}: ${err || out}`));
        return;
      }
      const n = parseFloat(out.trim());
      if (!Number.isFinite(n)) {
        reject(new Error(`Некорректная длительность от ffprobe: "${out.trim()}"`));
        return;
      }
      resolve(n);
    });
  });
}

export async function runFfmpeg(
  args: string[],
  log: Logger,
  options?: { label?: string },
): Promise<void> {
  const label = options?.label ?? "ffmpeg";
  const ffmpegBin = getFfmpegBinary();
  log.debug(label, { bin: ffmpegBin, args: [ffmpegBin, "-y", ...args].join(" ") });
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, ["-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ENOENT")) {
        reject(new Error(ffmpegNotFoundHint(ffmpegBin)));
        return;
      }
      reject(e);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label}: ошибка ffmpeg (код ${code}): ${stderr.slice(-4000)}`));
    });
  });
}

/** Escape path for ffmpeg subtitles filter (single-quoted). */
export function escapeForSubtitlesFilter(absPath: string): string {
  return absPath
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}
