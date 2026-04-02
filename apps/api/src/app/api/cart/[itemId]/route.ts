import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { carts, cartItems } from "@/lib/cart/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const { itemId } = await params;

  const cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    return NextResponse.json({ error: "Cart not found" }, { status: 404 });
  }

  await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { session, error } = await getRequiredSession();
  if (error) return error;

  const { itemId } = await params;
  const body = await request.json();

  const cart = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, session.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!cart) {
    return NextResponse.json({ error: "Cart not found" }, { status: 404 });
  }

  if (typeof body.quantity === "number" && body.quantity > 0) {
    await db
      .update(cartItems)
      .set({ quantity: body.quantity })
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
  }

  return NextResponse.json({ success: true });
}
