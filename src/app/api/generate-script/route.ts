import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { ensureJobDirs, ensureStorageDirs } from "@/lib/paths";
import { generateScript } from "@/lib/pipeline/generateScript";
import fs from "node:fs/promises";
import path from "node:path";
import { jobOutputDir } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 120;

const log = createLogger("api/generate-script");

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();
    const body = (await req.json()) as { jobId: string; topic: string };
    if (!body.jobId || !body.topic?.trim()) {
      return NextResponse.json({ error: "Нужны jobId и тема (topic)" }, { status: 400 });
    }
    await ensureJobDirs(body.jobId);
    const script = await generateScript(body.topic.trim());
    const out = path.join(jobOutputDir(body.jobId), "script.json");
    await fs.writeFile(out, JSON.stringify(script, null, 2), "utf8");
    log.info("saved", { out });
    return NextResponse.json({ script });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
