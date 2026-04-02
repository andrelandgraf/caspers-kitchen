import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { drivers } from "@/lib/drivers/schema";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET() {
  const { session: _, error } = await getRequiredSession();
  if (error) return error;

  const allDrivers = await db.select().from(drivers);

  return NextResponse.json(allDrivers);
}
