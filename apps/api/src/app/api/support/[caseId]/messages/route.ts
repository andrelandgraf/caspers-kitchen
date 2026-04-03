import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { supportMessages, supportCases } from "@/lib/support/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";
import assert from "@/lib/common/assert";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { error } = await getRequiredSession();
  if (error) return error;

  const { caseId } = await params;

  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.caseId, caseId));

  return NextResponse.json(messages);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const { caseId } = await params;
  const body = await request.json();
  assert(
    body.content && typeof body.content === "string",
    "content is required",
  );

  const supportCase = await db
    .select()
    .from(supportCases)
    .where(
      and(
        eq(supportCases.id, caseId),
        eq(supportCases.userId, session.user.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!supportCase) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const [message] = await db
    .insert(supportMessages)
    .values({
      caseId,
      userId: session.user.id,
      content: body.content,
    })
    .returning();

  return NextResponse.json(message, { status: 201 });
}
