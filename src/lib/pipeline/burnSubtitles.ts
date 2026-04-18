import path from "node:path";
import { createLogger } from "@/lib/logger";
import { escapeForSubtitlesFilter, FFMPEG_OUTPUT_COLOR_TAGS_BT709, runFfmpeg } from "@/lib/ffmpeg/exec";
import { jobOutputDir, resolvedSubtitleFontSetup } from "@/lib/paths";

const log = createLogger("burn_subtitles");

function sanitizeFontName(name: string): string {
  return name.replace(/'/g, "").trim() || "Arial";
}

export async function burnSubtitles(
  jobId: string,
  options: { videoPath: string; srtPath: string },
): Promise<string> {
  const outPath = path.join(jobOutputDir(jobId), "final.mp4");
  const sub = escapeForSubtitlesFilter(path.resolve(options.srtPath));
  const { fontsdir, fontname } = resolvedSubtitleFontSetup();
  const fn = sanitizeFontName(fontname);
  const fd = fontsdir ? escapeForSubtitlesFilter(path.resolve(fontsdir)) : "";
  const style = [
    "FontSize=15",
    `FontName=${fn}`,
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H80000000",
    "BorderStyle=1",
    "Outline=1",
    "Shadow=0",
    "Alignment=2",
    "MarginV=46",
    "Bold=1",
  ].join(",");
  const vf =
    fd.length > 0
      ? `subtitles='${sub}':fontsdir='${fd}':force_style='${style}'`
      : `subtitles='${sub}':force_style='${style}'`;

  log.info("subtitle_font", { fontname: fn, fontsdir: fd || null });

  await runFfmpeg(
    ["-i", options.videoPath, "-vf", vf, "-c:a", "copy", ...FFMPEG_OUTPUT_COLOR_TAGS_BT709, outPath],
    log,
    { label: "burn_subtitles" },
  );
  log.info("done", { outPath });
  return outPath;
}
