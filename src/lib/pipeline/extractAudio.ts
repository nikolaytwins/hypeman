import path from "node:path";
import { createLogger } from "@/lib/logger";
import { ensureNormalizedInputVideo } from "@/lib/pipeline/normalizeInput";
import { runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobAudioDir } from "@/lib/paths";

const log = createLogger("extract_audio");

/** Extract mp3 из нормализованного входного видео (HDR→SDR один раз → normalized.mp4). */
export async function extractAudioFromVideo(
  jobId: string,
  options?: { inputFileName?: string },
): Promise<string> {
  const videoPath = await ensureNormalizedInputVideo(jobId, {
    inputFileName: options?.inputFileName,
  });
  const outPath = path.join(jobAudioDir(jobId), "extracted.mp3");
  log.info("start", { videoPath, outPath });
  await runFfmpeg(
    [
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "2",
      outPath,
    ],
    log,
    { label: "extract_audio" },
  );
  log.info("done", { outPath });
  return outPath;
}
