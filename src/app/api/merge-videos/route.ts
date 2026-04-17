import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { mergeVideos } from "@/lib/pipeline/mergeVideos";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/merge-videos");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as {
      jobId: string;
      sceneFileNames: string[];
      sceneDurationsSec?: number[];
    };
    if (!body.jobId || !body.sceneFileNames?.length) {
      return NextResponse.json({ error: "Нужны jobId и sceneFileNames" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    const merged = await mergeVideos(body.jobId, body.sceneFileNames, body.sceneDurationsSec);
    log.info("ok", { merged });
    return NextResponse.json({ mergedPath: merged });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
