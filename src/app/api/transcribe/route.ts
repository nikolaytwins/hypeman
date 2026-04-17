import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { transcribeToText } from "@/lib/pipeline/generateSubtitles";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/transcribe");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; audioFileName?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    const name = body.audioFileName ?? "extracted.mp3";
    const text = await transcribeToText(body.jobId, name);
    log.info("ok", { chars: text.length });
    return NextResponse.json({ transcript: text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
