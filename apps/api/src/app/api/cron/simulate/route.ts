import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";
import { runTick } from "@/lib/simulation/engine";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const result = await runTick();
    return NextResponse.json({ success: true, run: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
