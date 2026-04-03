import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { supportCases } from "@/lib/support/schema";
import { refunds, credits } from "@/lib/refunds/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const { caseId } = await params;

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

  const [caseRefunds, caseCredits] = await Promise.all([
    db.select().from(refunds).where(eq(refunds.supportCaseId, caseId)),
    db.select().from(credits).where(eq(credits.supportCaseId, caseId)),
  ]);

  return NextResponse.json({ refunds: caseRefunds, credits: caseCredits });
}
