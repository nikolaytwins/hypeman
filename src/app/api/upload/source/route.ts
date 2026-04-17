import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobInputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/upload/source");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const form = await req.formData();
    const jobId = form.get("jobId");
    if (typeof jobId !== "string" || !jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Нужен файл file" }, { status: 400 });
    }
    await ensureJobDirs(jobId);
    const ext = path.extname(file.name) || ".mp4";
    const name = `source${ext}`;
    const out = path.join(jobInputDir(jobId), name);
    await fs.writeFile(out, Buffer.from(await file.arrayBuffer()));
    log.info("saved", { out });
    return NextResponse.json({ jobId, fileName: name });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
