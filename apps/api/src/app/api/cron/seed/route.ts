import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";
import { runSeed } from "@/lib/simulation/seed";
import { runBackfill } from "@/lib/simulation/backfill";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const seedResult = await runSeed();
    const backfillResult = await runBackfill();

    return NextResponse.json({
      success: true,
      seed: seedResult,
      backfill: backfillResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = (err as Record<string, unknown>)?.code;
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : undefined;
    console.error("[cron/seed]", message, { code, cause });
    return NextResponse.json({ error: message, code, cause }, { status: 500 });
  }
}
