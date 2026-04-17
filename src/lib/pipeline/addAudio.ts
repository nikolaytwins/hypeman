import path from "node:path";
import { createLogger } from "@/lib/logger";
import { FFMPEG_HDR_TO_SDR_ZSCALE, ffprobeDuration, runFfmpeg } from "@/lib/ffmpeg/exec";
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
        "-vf",
        FFMPEG_HDR_TO_SDR_ZSCALE,
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
        "-vf",
        FFMPEG_HDR_TO_SDR_ZSCALE,
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
        outPath,
      ],
      log,
      { label: "add_audio_trim" },
    );
  }

  log.info("done", { outPath });
  return outPath;
}
