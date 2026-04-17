import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { withActiveTracking } from "@/lib/pipeline/activeOperations";
import { generateVoice } from "@/lib/pipeline/generateVoice";
import type { ScriptPayload } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/generate-voice");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; script: ScriptPayload };
    if (!body.jobId || !body.script?.scenes?.length) {
      return NextResponse.json({ error: "Нужны jobId и объект script" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    return await withActiveTracking(body.jobId, "generate-voice", async () => {
      const audioPath = await generateVoice(body.jobId, body.script);
      log.info("ok", { audioPath });
      return NextResponse.json({ audioPath: "/audio/voice.mp3", jobId: body.jobId });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
