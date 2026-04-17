import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { SESSION_FILE, isValidJobId, type ReelListItem } from "@/lib/studioSession";
import { ensureStorageDirs, jobOutputDir } from "@/lib/paths";

export const runtime = "nodejs";

const log = createLogger("api/reels");

export async function GET() {
  try {
    await ensureStorageDirs();
    const out = path.join(process.cwd(), "storage", "output");
    let names: string[] = [];
    try {
      names = await fs.readdir(out);
    } catch {
      return NextResponse.json({ reels: [] as ReelListItem[] });
    }

    const items: ReelListItem[] = [];
    for (const jobId of names) {
      if (!isValidJobId(jobId)) continue;
      const dir = jobOutputDir(jobId);
      let stDir;
      try {
        stDir = await fs.stat(dir);
      } catch {
        continue;
      }
      if (!stDir.isDirectory()) continue;

      const sessionPath = path.join(dir, SESSION_FILE);
      let title = jobId;
      let updated = stDir.mtimeMs;
      let hasSession = false;

      try {
        const raw = await fs.readFile(sessionPath, "utf8");
        const s = JSON.parse(raw) as { script?: { title?: string }; savedAt?: number };
        hasSession = true;
        if (typeof s.script?.title === "string" && s.script.title.trim()) title = s.script.title.trim();
        if (typeof s.savedAt === "number") updated = Math.max(updated, s.savedAt);
        items.push({ jobId, title, updatedAt: updated, hasSession });
        continue;
      } catch {
        /* no session */
      }

      for (const name of ["script.adapted.json", "script.json"] as const) {
        const p = path.join(dir, name);
        try {
          const raw = await fs.readFile(p, "utf8");
          const scr = JSON.parse(raw) as { title?: string };
          if (typeof scr.title === "string" && scr.title.trim()) title = scr.title.trim();
          const stf = await fs.stat(p);
          updated = stf.mtimeMs;
          items.push({ jobId, title, updatedAt: updated, hasSession: false });
          break;
        } catch {
          /* next */
        }
      }
    }

    items.sort((a, b) => b.updatedAt - a.updatedAt);
    log.info("list", { count: items.length });
    return NextResponse.json({ reels: items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    log.error("list failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
