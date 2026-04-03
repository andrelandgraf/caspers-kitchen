import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { refunds, credits } from "@/lib/refunds/schema";
import { eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { error } = await getRequiredSession();
  if (error) return error;

  const { caseId } = await params;

  const [caseRefunds, caseCredits] = await Promise.all([
    db.select().from(refunds).where(eq(refunds.supportCaseId, caseId)),
    db.select().from(credits).where(eq(credits.supportCaseId, caseId)),
  ]);

  return NextResponse.json({ refunds: caseRefunds, credits: caseCredits });
}
