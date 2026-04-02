import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/orders/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const { orderId } = await params;

  const order = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, session.user.id)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending orders can be cancelled" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  return NextResponse.json(updated);
}
