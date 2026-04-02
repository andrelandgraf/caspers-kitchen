import { db } from "@/lib/db/client";
import { orders } from "@/lib/orders/schema";
import { drivers } from "@/lib/drivers/schema";
import { deliveries } from "@/lib/deliveries/schema";
import { carts, cartItems } from "@/lib/cart/schema";
import { supportCases, supportMessages, admins } from "@/lib/support/schema";
import { eq, and, lt, inArray, sql } from "drizzle-orm";
import { SUPPORT_ADMIN_REPLIES } from "./config";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

export async function progressOrderStates(): Promise<number> {
  let progressed = 0;
  const now = new Date();

  const pendingOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending"),
        lt(orders.updatedAt, minutesAgo(5 + Math.floor(Math.random() * 10))),
      ),
    );

  for (const order of pendingOrders) {
    await db
      .update(orders)
      .set({ status: "preparing", updatedAt: now })
      .where(eq(orders.id, order.id));
    progressed++;
  }

  const preparingOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "preparing"),
        lt(orders.updatedAt, minutesAgo(10 + Math.floor(Math.random() * 10))),
      ),
    );

  for (const order of preparingOrders) {
    await db
      .update(orders)
      .set({ status: "ready", updatedAt: now })
      .where(eq(orders.id, order.id));
    progressed++;
  }

  return progressed;
}

export async function assignDrivers(): Promise<number> {
  let assigned = 0;
  const now = new Date();

  const readyOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.status, "ready"));

  const availableDrivers = await db
    .select()
    .from(drivers)
    .where(eq(drivers.status, "available"));

  const driverPool = [...availableDrivers];

  for (const order of readyOrders) {
    if (driverPool.length === 0) break;

    const driver = driverPool.shift()!;

    await db.insert(deliveries).values({
      orderId: order.id,
      driverId: driver.id,
      startedAt: now,
    });

    await db
      .update(orders)
      .set({ status: "out_for_delivery", updatedAt: now })
      .where(eq(orders.id, order.id));

    await db
      .update(drivers)
      .set({ status: "on_delivery", updatedAt: now })
      .where(eq(drivers.id, driver.id));

    assigned++;
  }

  return assigned;
}

export async function progressDeliveries(): Promise<number> {
  let progressed = 0;
  const now = new Date();

  const assignedDeliveries = await db
    .select()
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "assigned"),
        lt(deliveries.createdAt, minutesAgo(2 + Math.floor(Math.random() * 3))),
      ),
    );

  for (const delivery of assignedDeliveries) {
    await db
      .update(deliveries)
      .set({ status: "picked_up", updatedAt: now })
      .where(eq(deliveries.id, delivery.id));
    progressed++;
  }

  const pickedUpDeliveries = await db
    .select()
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "picked_up"),
        lt(deliveries.updatedAt, minutesAgo(5 + Math.floor(Math.random() * 5))),
      ),
    );

  for (const delivery of pickedUpDeliveries) {
    await db
      .update(deliveries)
      .set({ status: "in_transit", updatedAt: now })
      .where(eq(deliveries.id, delivery.id));
    progressed++;
  }

  const inTransitDeliveries = await db
    .select()
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "in_transit"),
        lt(
          deliveries.updatedAt,
          minutesAgo(10 + Math.floor(Math.random() * 20)),
        ),
      ),
    );

  for (const delivery of inTransitDeliveries) {
    await db
      .update(deliveries)
      .set({ status: "delivered", deliveredAt: now, updatedAt: now })
      .where(eq(deliveries.id, delivery.id));

    await db
      .update(orders)
      .set({ status: "delivered", updatedAt: now })
      .where(eq(orders.id, delivery.orderId));

    await db
      .update(drivers)
      .set({ status: "available", updatedAt: now })
      .where(eq(drivers.id, delivery.driverId));

    progressed++;
  }

  return progressed;
}

export async function adminRepliesAndResolution(): Promise<number> {
  let actions = 0;
  const now = new Date();

  const adminList = await db.select().from(admins);
  if (adminList.length === 0) return 0;

  const openCases = await db
    .select()
    .from(supportCases)
    .where(sql`${supportCases.status} IN ('open', 'in_progress')`);

  for (const supportCase of openCases) {
    if (Math.random() > 0.5) continue;

    const admin = pick(adminList);
    const reply = pick(SUPPORT_ADMIN_REPLIES);

    await db.insert(supportMessages).values({
      caseId: supportCase.id,
      adminId: admin.id,
      content: reply,
    });

    if (supportCase.status === "open") {
      await db
        .update(supportCases)
        .set({ status: "in_progress", updatedAt: now })
        .where(eq(supportCases.id, supportCase.id));
    }

    actions++;

    const caseMessages = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.caseId, supportCase.id));

    if (caseMessages.length >= 3 && Math.random() < 0.3) {
      await db
        .update(supportCases)
        .set({ status: "resolved", updatedAt: now })
        .where(eq(supportCases.id, supportCase.id));
    }
  }

  return actions;
}

export async function cleanupAndAutoClose(): Promise<number> {
  let cleaned = 0;
  const now = new Date();
  const twoHoursAgo = minutesAgo(120);
  const twentyFourHoursAgo = minutesAgo(24 * 60);

  const staleCarts = await db
    .select()
    .from(carts)
    .where(lt(carts.updatedAt, twoHoursAgo));

  for (const cart of staleCarts) {
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await db.delete(carts).where(eq(carts.id, cart.id));
    cleaned++;
  }

  const resolvedCases = await db
    .select()
    .from(supportCases)
    .where(
      and(
        eq(supportCases.status, "resolved"),
        lt(supportCases.updatedAt, twentyFourHoursAgo),
      ),
    );

  for (const supportCase of resolvedCases) {
    await db
      .update(supportCases)
      .set({ status: "closed", updatedAt: now })
      .where(eq(supportCases.id, supportCase.id));
    cleaned++;
  }

  return cleaned;
}
