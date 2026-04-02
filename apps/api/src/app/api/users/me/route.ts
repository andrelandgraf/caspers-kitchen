import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/auth/schema";
import { eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const user = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      timeZone: users.timeZone,
      region: users.region,
      locale: users.locale,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const body = await request.json();
  const updates: Record<string, string> = {};

  if (typeof body.timeZone === "string") {
    updates.timeZone = body.timeZone;
  }
  if (typeof body.region === "string") {
    updates.region = body.region;
  }
  if (typeof body.locale === "string") {
    updates.locale = body.locale;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, session.user.id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      timeZone: users.timeZone,
      region: users.region,
      locale: users.locale,
    });

  return NextResponse.json(updated);
}
