import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { SESSION_FILE, isValidJobId, parseStudioDraftBody, type StudioDraftV1 } from "@/lib/studioSession";
import { ensureJobDirs, ensureStorageDirs, jobOutputDir, jobScenesDir } from "@/lib/paths";
import type { ScriptPayload } from "@/lib/pipeline/types";

export const runtime = "nodejs";

const log = createLogger("api/reels/session");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function listSceneFileNames(jobId: string): Promise<string[]> {
  const dir = jobScenesDir(jobId);
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => /^scene-\d{2}\./i.test(n)).sort();
  } catch {
    return [];
  }
}

async function buildFallbackDraft(jobId: string): Promise<StudioDraftV1 | null> {
  const dir = jobOutputDir(jobId);
  let script: ScriptPayload | null = null;
  let updated = Date.now();
  for (const name of ["script.adapted.json", "script.json"] as const) {
    const p = path.join(dir, name);
    const s = await readJsonFile<ScriptPayload>(p);
    if (s?.scenes?.length) {
      script = s;
      try {
        const st = await fs.stat(p);
        updated = st.mtimeMs;
      } catch {
        /* ignore */
      }
      break;
    }
  }
  if (!script?.scenes?.length) return null;

  const transcriptPath = path.join(dir, "transcript.txt");
  let transcript = "";
  try {
    transcript = await fs.readFile(transcriptPath, "utf8");
  } catch {
    /* ignore */
  }

  const sceneFileNames = await listSceneFileNames(jobId);

  return {
    v: 1,
    savedAt: updated,
    jobId,
    origin: null,
    screen: "new_script",
    topic: "",
    script,
    transcript,
    sceneFileNames,
    sourceReady: false,
    renderProgress: 0,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await ctx.params;
    if (!isValidJobId(jobId)) {
      return NextResponse.json({ error: "Некорректный jobId" }, { status: 400 });
    }
    await ensureStorageDirs();
    const sessionPath = path.join(jobOutputDir(jobId), SESSION_FILE);
    const fromFile = await readJsonFile<unknown>(sessionPath);
    const parsed = fromFile ? parseStudioDraftBody(fromFile) : null;
    if (parsed && parsed.jobId === jobId) {
      return NextResponse.json({ draft: parsed });
    }
    const fallback = await buildFallbackDraft(jobId);
    if (!fallback) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }
    log.info("fallback script only", { jobId });
    return NextResponse.json({ draft: fallback });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("get failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await ctx.params;
    if (!isValidJobId(jobId)) {
      return NextResponse.json({ error: "Некорректный jobId" }, { status: 400 });
    }
    const body = (await req.json()) as unknown;
    const parsed = parseStudioDraftBody(body);
    if (!parsed || parsed.jobId !== jobId) {
      return NextResponse.json(
        { error: "Тело запроса должно быть валидным studio-session (v1, тот же jobId)" },
        { status: 400 },
      );
    }
    await ensureStorageDirs();
    await ensureJobDirs(jobId);
    const outPath = path.join(jobOutputDir(jobId), SESSION_FILE);
    const toWrite = { ...parsed, jobId, savedAt: Date.now() };
    await fs.writeFile(outPath, JSON.stringify(toWrite, null, 2), "utf8");
    log.info("saved", { jobId });
    return NextResponse.json({ ok: true, draft: toWrite });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("put failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
