import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { jobAudioDir } from "@/lib/paths";
import type { ScriptPayload } from "@/lib/pipeline/types";
import { scriptToPlainText } from "@/lib/pipeline/types";

const log = createLogger("generate_voice");

export async function generateVoice(jobId: string, script: ScriptPayload): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error("Не задан ELEVENLABS_API_KEY");
  if (!voiceId) throw new Error("Не задан ELEVENLABS_VOICE_ID");

  const text = scriptToPlainText(script);
  log.info("request", { jobId, chars: text.length });

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    log.error("ElevenLabs error", { status: res.status, body: t.slice(0, 2000) });
    throw new Error(`ElevenLabs: HTTP ${res.status}: ${t.slice(0, 500)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(jobAudioDir(jobId), "voice.mp3");
  await fs.writeFile(outPath, buf);
  log.info("saved", { outPath, bytes: buf.length });
  return outPath;
}
