import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { withActiveTracking } from "@/lib/pipeline/activeOperations";
import { generateSubtitles } from "@/lib/pipeline/generateSubtitles";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/generate-subtitles");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; audioFileName?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    return await withActiveTracking(body.jobId, "generate-subtitles", async () => {
      const srt = await generateSubtitles(body.jobId, {
        audioFileName: body.audioFileName,
      });
      log.info("ok", { srt });
      return NextResponse.json({ srtPath: srt });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
