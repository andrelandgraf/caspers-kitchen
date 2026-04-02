import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { promotions } from "@/lib/promotions/schema";
import { users } from "@/lib/auth/schema";
import { and, eq, lte, gte, or, isNull } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const user = await db
    .select({ region: users.region })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  const now = new Date();

  const activePromos = await db
    .select({
      id: promotions.id,
      code: promotions.code,
      name: promotions.name,
      description: promotions.description,
      discountStrategy: promotions.discountStrategy,
      region: promotions.region,
      category: promotions.category,
      startsAt: promotions.startsAt,
      endsAt: promotions.endsAt,
    })
    .from(promotions)
    .where(
      and(
        lte(promotions.startsAt, now),
        gte(promotions.endsAt, now),
        or(
          isNull(promotions.region),
          eq(promotions.region, user?.region ?? ""),
        ),
        or(
          isNull(promotions.maxRedemptions),
          lte(promotions.currentRedemptions, promotions.maxRedemptions),
        ),
      ),
    );

  return NextResponse.json(activePromos);
}
