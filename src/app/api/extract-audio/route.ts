import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { extractAudioFromVideo } from "@/lib/pipeline/extractAudio";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/extract-audio");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; inputFileName?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    const out = await extractAudioFromVideo(body.jobId, {
      inputFileName: body.inputFileName,
    });
    log.info("ok", { out });
    return NextResponse.json({ jobId: body.jobId, extractedPath: out });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
