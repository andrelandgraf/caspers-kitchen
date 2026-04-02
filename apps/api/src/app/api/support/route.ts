import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { supportCases } from "@/lib/support/schema";
import { eq, desc } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";
import assert from "@/lib/common/assert";

export async function GET() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const cases = await db
    .select()
    .from(supportCases)
    .where(eq(supportCases.userId, session.user.id))
    .orderBy(desc(supportCases.createdAt));

  return NextResponse.json(cases);
}

export async function POST(request: Request) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const body = await request.json();
  assert(
    body.subject && typeof body.subject === "string",
    "subject is required",
  );

  const [newCase] = await db
    .insert(supportCases)
    .values({
      userId: session.user.id,
      subject: body.subject,
    })
    .returning();

  return NextResponse.json(newCase, { status: 201 });
}
