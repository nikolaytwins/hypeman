import path from "node:path";
import { createLogger } from "@/lib/logger";
import { escapeForSubtitlesFilter, runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobOutputDir } from "@/lib/paths";

const log = createLogger("burn_subtitles");

export async function burnSubtitles(
  jobId: string,
  options: { videoPath: string; srtPath: string },
): Promise<string> {
  const outPath = path.join(jobOutputDir(jobId), "final.mp4");
  const sub = escapeForSubtitlesFilter(path.resolve(options.srtPath));
  const vf = `subtitles='${sub}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=48'`;

  await runFfmpeg(
    ["-i", options.videoPath, "-vf", vf, "-c:a", "copy", outPath],
    log,
    { label: "burn_subtitles" },
  );
  log.info("done", { outPath });
  return outPath;
}
