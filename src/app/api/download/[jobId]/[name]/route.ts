import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { jobAudioDir, jobOutputDir } from "@/lib/paths";

export const runtime = "nodejs";

const ALLOWED = new Set(["final.mp4", "with_audio.mp4", "captions.srt", "voice.mp3"]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string; name: string }> },
) {
  const { jobId, name } = await ctx.params;
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: "Файл не разрешён" }, { status: 400 });
  }
  let base = jobOutputDir(jobId);
  if (name === "voice.mp3") {
    base = jobAudioDir(jobId);
  }
  const filePath = path.join(base, name);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }
  const buf = await fs.readFile(filePath);
  const type =
    name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".srt") ? "text/plain" : "audio/mpeg";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
