import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobOutputDir } from "@/lib/paths";
import { withActiveTracking } from "@/lib/pipeline/activeOperations";
import { adaptScript } from "@/lib/pipeline/adaptScript";

export const runtime = "nodejs";
export const maxDuration = 120;

const log = createLogger("api/adapt-script");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; transcript: string };
    if (!body.jobId || !body.transcript?.trim()) {
      return NextResponse.json({ error: "Нужны jobId и текст расшифровки" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    return await withActiveTracking(body.jobId, "adapt-script", async () => {
      const script = await adaptScript(body.transcript.trim());
      const out = path.join(jobOutputDir(body.jobId), "script.adapted.json");
      await fs.writeFile(out, JSON.stringify(script, null, 2), "utf8");
      log.info("saved", { out });
      return NextResponse.json({ script });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
