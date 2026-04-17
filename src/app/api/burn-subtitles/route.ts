import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobInputDir, jobOutputDir } from "@/lib/paths";
import { burnSubtitles } from "@/lib/pipeline/burnSubtitles";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/burn-subtitles");

async function firstInputVideoPath(jobId: string): Promise<string> {
  const dir = jobInputDir(jobId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    throw new Error("Папка input пуста — загрузите видео");
  }
  const video = names.find((n) => /\.(mp4|mov|webm|mkv)$/i.test(n));
  if (!video) {
    throw new Error("В input/ нет видео (mp4, mov, webm, mkv)");
  }
  return path.join(dir, video);
}

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as {
      jobId: string;
      videoPath?: string;
      srtPath?: string;
      /** input — исходное загруженное видео; output (по умолчанию) — with_audio.mp4 после склейки */
      videoSource?: "input" | "output";
    };
    if (!body.jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    const videoPath =
      body.videoPath ??
      (body.videoSource === "input"
        ? await firstInputVideoPath(body.jobId)
        : path.join(jobOutputDir(body.jobId), "with_audio.mp4"));
    const srtPath = body.srtPath ?? path.join(jobOutputDir(body.jobId), "captions.srt");
    const finalPath = await burnSubtitles(body.jobId, { videoPath, srtPath });
    log.info("ok", { finalPath });
    return NextResponse.json({ finalPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
