import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";
import { runSeed } from "@/lib/simulation/seed";
import { runBackfill } from "@/lib/simulation/backfill";

export async function POST(request: Request) {
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
