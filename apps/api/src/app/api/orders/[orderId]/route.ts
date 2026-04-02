import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/orders/schema";
import { menuItems } from "@/lib/menu/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET(
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

  const items = await db
    .select({
      id: orderItems.id,
      menuItemId: orderItems.menuItemId,
      quantity: orderItems.quantity,
      priceInCents: orderItems.priceInCents,
      name: menuItems.name,
    })
    .from(orderItems)
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orderItems.orderId, order.id));

  return NextResponse.json({ order, items });
}
