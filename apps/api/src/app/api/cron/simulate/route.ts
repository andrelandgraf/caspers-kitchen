import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";
import { runTick } from "@/lib/simulation/engine";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const result = await runTick();
    return NextResponse.json({ success: true, run: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    console.error("[cron/simulate]", message, { cause });
    return NextResponse.json({ error: message, cause }, { status: 500 });
  }
}
