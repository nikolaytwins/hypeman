import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs, jobScenesDir } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 300;

const log = createLogger("api/upload/scenes");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const form = await req.formData();
    const jobId = form.get("jobId");
    if (typeof jobId !== "string" || !jobId) {
      return NextResponse.json({ error: "Нужен jobId" }, { status: 400 });
    }
    await ensureJobDirs(jobId);
    const dir = jobScenesDir(jobId);
    const saved: string[] = [];
    const files = form
      .getAll("files")
      .filter((v): v is File => v instanceof File && v.size > 0);
    let i = 0;
    for (const value of files) {
      const ext = path.extname(value.name) || ".mp4";
      const name = `scene-${String(i).padStart(2, "0")}${ext}`;
      const buf = Buffer.from(await value.arrayBuffer());
      const out = path.join(dir, name);
      await fs.writeFile(out, buf);
      saved.push(name);
      i += 1;
    }
    if (!saved.length) {
      return NextResponse.json(
        { error: "В форме нет файлов сцен (поле files)" },
        { status: 400 },
      );
    }
    log.info("saved", { jobId, count: saved.length });
    return NextResponse.json({ jobId, sceneFileNames: saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
