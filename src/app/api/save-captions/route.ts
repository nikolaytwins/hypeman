import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobOutputDir } from "@/lib/paths";
import { isValidJobId } from "@/lib/studioSession";

export const runtime = "nodejs";

const log = createLogger("api/save-captions");
const OUT = "captions.srt";

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId?: string; srt?: string };
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId || !isValidJobId(jobId)) {
      return NextResponse.json({ error: "Нужен корректный jobId" }, { status: 400 });
    }
    const srt = typeof body.srt === "string" ? body.srt : "";
    await ensureJobDirs(jobId);
    const outPath = path.join(jobOutputDir(jobId), OUT);
    await fs.writeFile(outPath, srt, { encoding: "utf8" });
    log.info("ok", { outPath, bytes: Buffer.byteLength(srt, "utf8") });
    return NextResponse.json({ ok: true, path: outPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
