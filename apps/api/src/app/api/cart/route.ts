import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { carts, cartItems } from "@/lib/cart/schema";
import { menuItems } from "@/lib/menu/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";
import assert from "@/lib/common/assert";

export async function GET() {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    return NextResponse.json({ cart: null, items: [] });
  }

  const items = await db
    .select({
      id: cartItems.id,
      menuItemId: cartItems.menuItemId,
      quantity: cartItems.quantity,
      name: menuItems.name,
      priceInCents: menuItems.priceInCents,
    })
    .from(cartItems)
    .innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
    .where(eq(cartItems.cartId, cart.id));

  return NextResponse.json({ cart, items });
}

export async function POST(request: Request) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const body = await request.json();
  assert(
    body.menuItemId && typeof body.menuItemId === "string",
    "menuItemId is required",
  );
  const quantity =
    typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : 1;

  let cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    [cart] = await db
      .insert(carts)
      .values({ userId: session.user.id })
      .returning();
  }

  const existingItem = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.cartId, cart.id),
        eq(cartItems.menuItemId, body.menuItemId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existingItem) {
    await db
      .update(cartItems)
      .set({ quantity: existingItem.quantity + quantity })
      .where(eq(cartItems.id, existingItem.id));
  } else {
    await db.insert(cartItems).values({
      cartId: cart.id,
      menuItemId: body.menuItemId,
      quantity,
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
