import { NextResponse } from "next/server";
import { listActiveOperations } from "@/lib/pipeline/activeOperations";

export const runtime = "nodejs";

/** Список долгих операций (ffmpeg / ИИ), выполняющихся в этом воркере Node. */
export async function GET() {
  try {
    const operations = listActiveOperations();
    return NextResponse.json({ operations });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: message, operations: [] }, { status: 500 });
  }
}
