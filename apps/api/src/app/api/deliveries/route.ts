import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deliveries } from "@/lib/deliveries/schema";
import { orders } from "@/lib/orders/schema";
import { drivers } from "@/lib/drivers/schema";
import { eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/auth/session";
import assert from "@/lib/common/assert";

export async function GET() {
  const { session: _, error } = await getRequiredSession();
  if (error) return error;

  const allDeliveries = await db
    .select({
      id: deliveries.id,
      orderId: deliveries.orderId,
      driverId: deliveries.driverId,
      status: deliveries.status,
      startedAt: deliveries.startedAt,
      deliveredAt: deliveries.deliveredAt,
      driverName: drivers.name,
    })
    .from(deliveries)
    .innerJoin(drivers, eq(deliveries.driverId, drivers.id));

  return NextResponse.json(allDeliveries);
}

export async function POST(request: Request) {
  const { session: _, error } = await getRequiredSession();
  if (error) return error;

  const body = await request.json();
  assert(
    body.orderId && typeof body.orderId === "string",
    "orderId is required",
  );
  assert(
    body.driverId && typeof body.driverId === "string",
    "driverId is required",
  );

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, body.orderId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const driver = await db
    .select()
    .from(drivers)
    .where(eq(drivers.id, body.driverId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const [delivery] = await db
    .insert(deliveries)
    .values({
      orderId: body.orderId,
      driverId: body.driverId,
      startedAt: new Date(),
    })
    .returning();

  await db
    .update(orders)
    .set({ status: "out_for_delivery", updatedAt: new Date() })
    .where(eq(orders.id, body.orderId));

  await db
    .update(drivers)
    .set({ status: "on_delivery", updatedAt: new Date() })
    .where(eq(drivers.id, body.driverId));

  return NextResponse.json(delivery, { status: 201 });
}
