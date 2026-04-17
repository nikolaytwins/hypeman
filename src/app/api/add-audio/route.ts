import path from "node:path";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobAudioDir, jobOutputDir } from "@/lib/paths";
import { withActiveTracking } from "@/lib/pipeline/activeOperations";
import { addAudio } from "@/lib/pipeline/addAudio";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/add-audio");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as {
      jobId: string;
      videoPath?: string;
      audioFileName?: string;
    };
    if (!body.jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    return await withActiveTracking(body.jobId, "add-audio", async () => {
      const videoPath =
        body.videoPath ?? path.join(jobOutputDir(body.jobId), "merged_no_audio.mp4");
      const audioPath = path.join(jobAudioDir(body.jobId), body.audioFileName ?? "voice.mp3");
      const out = await addAudio(body.jobId, { videoPath, audioPath });
      log.info("ok", { out });
      return NextResponse.json({ videoPath: out });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
