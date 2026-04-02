import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { simulationRuns } from "@/lib/simulation/schema";
import { desc } from "drizzle-orm";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";

export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const recentRuns = await db
    .select()
    .from(simulationRuns)
    .orderBy(desc(simulationRuns.startedAt))
    .limit(10);

  const latestRun = recentRuns[0] ?? null;
  const runningCount = recentRuns.filter((r) => r.status === "running").length;

  return NextResponse.json({
    latestRun,
    recentRuns,
    hasRunningTick: runningCount > 0,
  });
}
