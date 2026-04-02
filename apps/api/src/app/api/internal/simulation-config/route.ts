import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { simulationConfigs } from "@/lib/simulation/schema";
import { eq, desc } from "drizzle-orm";
import { verifyCronSecret } from "@/lib/simulation/cron-auth";

export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const config = await db
    .select()
    .from(simulationConfigs)
    .where(eq(simulationConfigs.active, "active"))
    .orderBy(desc(simulationConfigs.version))
    .limit(1)
    .then((rows) => rows[0]);

  if (!config) {
    return NextResponse.json({ error: "No active config" }, { status: 404 });
  }

  return NextResponse.json(config);
}

export async function PATCH(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const body = await request.json();

  const current = await db
    .select()
    .from(simulationConfigs)
    .where(eq(simulationConfigs.active, "active"))
    .orderBy(desc(simulationConfigs.version))
    .limit(1)
    .then((rows) => rows[0]);

  if (!current) {
    return NextResponse.json(
      { error: "No active config to update" },
      { status: 404 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(simulationConfigs)
    .set({
      baseRates: body.baseRates ?? current.baseRates,
      diurnalProfile: body.diurnalProfile ?? current.diurnalProfile,
      weekdayProfile: body.weekdayProfile ?? current.weekdayProfile,
      geoProfile: body.geoProfile ?? current.geoProfile,
      safetyCaps: body.safetyCaps ?? current.safetyCaps,
      version: current.version + 1,
      updatedAt: now,
    })
    .where(eq(simulationConfigs.id, current.id))
    .returning();

  return NextResponse.json(updated);
}
