import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deliveries } from "@/lib/deliveries/schema";
import { orders } from "@/lib/orders/schema";
import { drivers } from "@/lib/drivers/schema";
import { eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deliveryId: string }> },
) {
  const { session: _, error } = await getRequiredSession();
  if (error) return error;

  const { deliveryId } = await params;

  const body = await request.json().catch(() => ({}));

  const delivery = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, deliveryId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!delivery) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  const now = body.deliveredAt ? new Date(body.deliveredAt) : new Date();

  const [updated] = await db
    .update(deliveries)
    .set({ status: "delivered", deliveredAt: now, updatedAt: now })
    .where(eq(deliveries.id, deliveryId))
    .returning();

  await db
    .update(orders)
    .set({ status: "delivered", updatedAt: now })
    .where(eq(orders.id, delivery.orderId));

  await db
    .update(drivers)
    .set({ status: "available", updatedAt: now })
    .where(eq(drivers.id, delivery.driverId));

  return NextResponse.json(updated);
}
