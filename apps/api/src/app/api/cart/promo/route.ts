import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { carts } from "@/lib/cart/schema";
import { promotions } from "@/lib/promotions/schema";
import { and, eq, lte, gte, or, isNull } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";
import assert from "@/lib/common/assert";

export async function POST(request: Request) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const body = await request.json();
  assert(body.code && typeof body.code === "string", "promo code is required");

  const cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    return NextResponse.json({ error: "No active cart" }, { status: 400 });
  }

  const now = new Date();
  const promo = await db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.code, body.code.toUpperCase()),
        lte(promotions.startsAt, now),
        gte(promotions.endsAt, now),
        or(
          isNull(promotions.maxRedemptions),
          lte(promotions.currentRedemptions, promotions.maxRedemptions),
        ),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!promo) {
    return NextResponse.json(
      { error: "Invalid or expired promo code" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    valid: true,
    promotion: {
      id: promo.id,
      code: promo.code,
      name: promo.name,
      discountStrategy: promo.discountStrategy,
    },
  });
}
