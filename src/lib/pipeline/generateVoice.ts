import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@/lib/logger";
import { jobAudioDir } from "@/lib/paths";
import type { ScriptPayload } from "@/lib/pipeline/types";
import { scriptToPlainText } from "@/lib/pipeline/types";

const log = createLogger("generate_voice");

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  let c: unknown = err.cause;
  for (let i = 0; i < 8 && c instanceof Error; i++) {
    parts.push(c.message);
    c = c.cause;
  }
  return parts.join(" · ");
}

function pickProxyUrl(): string | undefined {
  return (
    process.env.ELEVENLABS_HTTPS_PROXY?.trim() ||
    process.env.ELEVENLABS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim()
  );
}

function hintForFetchFailure(detail: string, usingProxy: boolean): string {
  const d = detail.toLowerCase();
  if (usingProxy && (d.includes("503") || d.includes("proxy response"))) {
    return " Прокси ответил 503 на CONNECT до api.elevenlabs.io — это не ElevenLabs и не «не тот SOCKS»: у провайдера перегруз/лимит/блок цели или неверный endpoint. Проверьте кабинет/квоту, напишите в поддержку прокси, попробуйте другой порт/хост из их инструкции.";
  }
  if (/407/.test(detail)) {
    return " Прокси требует авторизацию (407): проверьте логин/пароль в ELEVENLABS_HTTPS_PROXY (http://user:pass@host:port), спецсимволы в URL-кодировании.";
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(detail)) {
    return " Прокси недоступен с VPS (сеть/firewall) или неверный host/port. Проверка: curl -v -x \"…\" https://api.elevenlabs.io/v1/user -H \"xi-api-key: …\"";
  }
  if (usingProxy) {
    return " Проверьте строку http://user:pass@host:port (HTTP CONNECT). Если провайдер выдал только SOCKS5 — нужен другой HTTP-endpoint или доработка кода.";
  }
  return "";
}

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

  const proxyUrl = pickProxyUrl();

  try {
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
        if (!res.ok) {
          const t = await res.text();
          log.error("ElevenLabs error", { status: res.status, body: t.slice(0, 2000) });
          const cloudflareHtml =
            t.includes("Just a moment") ||
            t.includes("cloudflare") ||
            t.includes("cf-browser-verification");
          const hint = cloudflareHtml
            ? " Cloudflare/ElevenLabs: попробуйте другой прокси или регион."
            : "";
          throw new Error(`ElevenLabs: HTTP ${res.status}: ${t.slice(0, 400)}${hint}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const outPath = path.join(jobAudioDir(jobId), "voice.mp3");
        await fs.writeFile(outPath, buf);
        log.info("saved", { outPath, bytes: buf.length });
        return outPath;
      } finally {
        await dispatcher.close();
      }
    }

    res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      const t = await res.text();
      log.error("ElevenLabs error", { status: res.status, body: t.slice(0, 2000) });
      const cloudflareHtml =
        t.includes("Just a moment") || t.includes("cloudflare") || t.includes("cf-browser-verification");
      const hint = cloudflareHtml
        ? " Это не сбой сессии в браузере: Cloudflare на стороне ElevenLabs отрезает запрос с IP вашего VPS. Варианты: задать ELEVENLABS_HTTPS_PROXY (другой выход), другой хостинг, или написать в поддержку ElevenLabs с IP сервера."
        : "";
      throw new Error(`ElevenLabs: HTTP ${res.status}: ${t.slice(0, 400)}${hint}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join(jobAudioDir(jobId), "voice.mp3");
    await fs.writeFile(outPath, buf);
    log.info("saved", { outPath, bytes: buf.length });
    return outPath;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ElevenLabs: HTTP")) {
      throw e;
    }
    const detail = formatFetchError(e);
    log.error("ElevenLabs fetch failed", { detail });
    const hint = hintForFetchFailure(detail, Boolean(proxyUrl));
    throw new Error(`ElevenLabs: ${detail}${hint}`);
  }
}
