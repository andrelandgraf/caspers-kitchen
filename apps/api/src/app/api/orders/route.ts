import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/orders/schema";
import { carts, cartItems } from "@/lib/cart/schema";
import { menuItems } from "@/lib/menu/schema";
import { eq, desc } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function GET() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  return NextResponse.json(userOrders);
}

export async function POST() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const items = await db
    .select({
      menuItemId: cartItems.menuItemId,
      quantity: cartItems.quantity,
      priceInCents: menuItems.priceInCents,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
    .where(eq(cartItems.cartId, cart.id));

  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const totalInCents = items.reduce(
    (sum, item) => sum + item.priceInCents * item.quantity,
    0,
  );

  const [newOrder] = await db
    .insert(orders)
    .values({
      userId: session.user.id,
      totalInCents,
    })
    .returning();

  await db.insert(orderItems).values(
    items.map((item) => ({
      orderId: newOrder.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      priceInCents: item.priceInCents,
    })),
  );

  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  await db.delete(carts).where(eq(carts.id, cart.id));

  return NextResponse.json(newOrder, { status: 201 });
}
