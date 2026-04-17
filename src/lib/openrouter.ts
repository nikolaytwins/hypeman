import { createLogger } from "@/lib/logger";

const log = createLogger("openrouter");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function completeChat(options: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("Не задан OPENROUTER_API_KEY");
  }
  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";
  const body = {
    model,
    temperature: options.temperature ?? 0.7,
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };
  log.info("request", { model });
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Hypeman",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    log.error("OpenRouter error", { status: res.status, body: t.slice(0, 2000) });
    throw new Error(`OpenRouter: HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter вернул пустой ответ");
  }
  return content;
}
