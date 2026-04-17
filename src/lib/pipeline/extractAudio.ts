import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobAudioDir, jobInputDir } from "@/lib/paths";

const log = createLogger("extract_audio");

async function resolveInputFile(jobId: string, hint?: string): Promise<string> {
  if (hint) return hint;
  const dir = jobInputDir(jobId);
  const names = await fs.readdir(dir);
  const video = names.find((n) => /\.(mp4|mov|webm|mkv)$/i.test(n));
  if (!video) {
    throw new Error("В input/ нет видео — сначала загрузите исходный ролик");
  }
  return video;
}

/** Extract mp3 from video in input/{jobId}/. */
export async function extractAudioFromVideo(
  jobId: string,
  options?: { inputFileName?: string },
): Promise<string> {
  const fileName = await resolveInputFile(jobId, options?.inputFileName);
  const videoPath = path.join(jobInputDir(jobId), fileName);
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
