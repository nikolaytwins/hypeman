import path from "node:path";
import { createLogger } from "@/lib/logger";
import { FFMPEG_OUTPUT_COLOR_TAGS_BT709, ffprobeDuration, runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobOutputDir } from "@/lib/paths";

const log = createLogger("add_audio");

/**
 * Mux voiceover onto merged video. If video is shorter than audio, loop video to fill.
 * Output length follows audio.
 */
export async function addAudio(
  jobId: string,
  options: { videoPath: string; audioPath: string },
): Promise<string> {
  const { videoPath, audioPath } = options;
  const outPath = path.join(jobOutputDir(jobId), "with_audio.mp4");

  const vDur = await ffprobeDuration(videoPath, log);
  const aDur = await ffprobeDuration(audioPath, log);
  log.info("durations", { videoSec: vDur, audioSec: aDur });

  if (vDur + 0.05 < aDur) {
    await runFfmpeg(
      [
        "-stream_loop",
        "-1",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        ...FFMPEG_OUTPUT_COLOR_TAGS_BT709,
        outPath,
      ],
      log,
      { label: "add_audio_loop" },
    );
  } else {
    await runFfmpeg(
      [
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        ...FFMPEG_OUTPUT_COLOR_TAGS_BT709,
        outPath,
      ],
      log,
      { label: "add_audio_trim" },
    );
  }

  log.info("done", { outPath });
  return outPath;
}
