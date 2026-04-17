import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { jobAudioDir } from "@/lib/paths";
import type { ScriptPayload } from "@/lib/pipeline/types";
import { scriptToPlainText } from "@/lib/pipeline/types";

const log = createLogger("generate_voice");

export async function generateVoice(jobId: string, script: ScriptPayload): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey) throw new Error("Не задан ELEVENLABS_API_KEY");
  if (!voiceId) throw new Error("Не задан ELEVENLABS_VOICE_ID");

  const text = scriptToPlainText(script);
  log.info("request", { jobId, chars: text.length });

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const headers: Record<string, string> = {
    "xi-api-key": apiKey,
    Accept: "audio/mpeg",
    "Content-Type": "application/json",
    "User-Agent":
      process.env.ELEVENLABS_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
  const body = JSON.stringify({
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID?.trim() ?? "eleven_multilingual_v2",
  });

  const proxyUrl =
    process.env.ELEVENLABS_HTTPS_PROXY?.trim() ||
    process.env.ELEVENLABS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim();

  let res: Response;
  if (proxyUrl) {
    log.info("using proxy", { proxyHost: proxyUrl.replace(/\/\/.*@/, "//***@") });
    const { fetch: undiciFetch, ProxyAgent } = await import("undici");
    const dispatcher = new ProxyAgent(proxyUrl);
    try {
      res = (await undiciFetch(url, {
        method: "POST",
        dispatcher,
        headers,
        body,
      })) as unknown as Response;
    } finally {
      await dispatcher.close();
    }
  } else {
    res = await fetch(url, { method: "POST", headers, body });
  }

  if (!res.ok) {
    const t = await res.text();
    log.error("ElevenLabs error", { status: res.status, body: t.slice(0, 2000) });
    const cloudflareHtml =
      t.includes("Just a moment") || t.includes("cloudflare") || t.includes("cf-browser-verification");
    const hint = cloudflareHtml
      ? " Это не сбой сессии в браузере: Cloudflare на стороне ElevenLabs отрезает запрос с IP вашего VPS. Варианты: задать ELEVENLABS_HTTPS_PROXY (HTTPS-прокси с другим выходом, напр. EU/US), другой хостинг, или написать в поддержку ElevenLabs с IP сервера."
      : "";
    throw new Error(`ElevenLabs: HTTP ${res.status}: ${t.slice(0, 400)}${hint}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(jobAudioDir(jobId), "voice.mp3");
  await fs.writeFile(outPath, buf);
  log.info("saved", { outPath, bytes: buf.length });
  return outPath;
}
