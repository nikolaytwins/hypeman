import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { FFMPEG_OUTPUT_COLOR_TAGS_BT709, runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobOutputDir, jobScenesDir } from "@/lib/paths";

const log = createLogger("merge_videos");

const TARGET_W = 1080;
const TARGET_H = 1920;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

function isImagePath(filePath: string): boolean {
  return IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

/** Normalize one clip (or still image as timed clip) to vertical 1080x1920, no audio. */
async function normalizeScene(
  inputPath: string,
  outputPath: string,
  index: number,
  durationHintSec?: number,
): Promise<void> {
  const scalePad = [
    `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease`,
    `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2`,
    "setsar=1",
  ].join(",");

  if (isImagePath(inputPath)) {
    const sec = typeof durationHintSec === "number" && durationHintSec > 0 ? durationHintSec : 5;
    await runFfmpeg(
      [
        "-loop",
        "1",
        "-i",
        inputPath,
        "-t",
        String(sec),
        "-an",
        "-vf",
        scalePad,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        ...FFMPEG_OUTPUT_COLOR_TAGS_BT709,
        outputPath,
      ],
      log,
      { label: `normalize_image_${index}` },
    );
    return;
  }

  await runFfmpeg(
    [
      "-i",
      inputPath,
      "-an",
      "-vf",
      scalePad,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      ...FFMPEG_OUTPUT_COLOR_TAGS_BT709,
      outputPath,
    ],
    log,
    { label: `normalize_scene_${index}` },
  );
}

/** Concatenate scene clips (video or still images) into merged-no-audio.mp4 */
export async function mergeVideos(
  jobId: string,
  sceneFileNames: string[],
  sceneDurationsSec?: number[],
): Promise<string> {
  if (!sceneFileNames.length) {
    throw new Error("Нет сцен для склейки");
  }
  const dir = jobScenesDir(jobId);
  const work = path.join(jobOutputDir(jobId), "_work");
  await fs.mkdir(work, { recursive: true });

  const normalized: string[] = [];
  for (let i = 0; i < sceneFileNames.length; i++) {
    const name = sceneFileNames[i];
    const inPath = path.join(dir, name);
    const normPath = path.join(work, `n_${i}.mp4`);
    const dur = sceneDurationsSec?.[i];
    log.info("normalize", { inPath, normPath, dur });
    await normalizeScene(inPath, normPath, i, dur);
    normalized.push(normPath);
  }

  const listPath = path.join(work, "concat.txt");
  const listBody = normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, listBody, "utf8");

  const mergedPath = path.join(jobOutputDir(jobId), "merged_no_audio.mp4");
  await runFfmpeg(
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-an",
      ...FFMPEG_OUTPUT_COLOR_TAGS_BT709,
      mergedPath,
    ],
    log,
    { label: "concat_scenes" },
  );
  log.info("done", { mergedPath });
  return mergedPath;
}
