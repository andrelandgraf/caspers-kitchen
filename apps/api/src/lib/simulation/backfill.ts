import { db } from "@/lib/db/client";
import { users } from "@/lib/auth/schema";
import { orders, orderItems } from "@/lib/orders/schema";
import { carts, cartItems } from "@/lib/cart/schema";
import { menuItems } from "@/lib/menu/schema";
import { drivers } from "@/lib/drivers/schema";
import { deliveries } from "@/lib/deliveries/schema";
import { supportCases, supportMessages, admins } from "@/lib/support/schema";
import { sql, count } from "drizzle-orm";
import { createApiClient } from "./api-client";
import {
  getSimPassword,
  DEFAULT_GEO_PROFILE,
  SUPPORT_SUBJECTS,
  SUPPORT_USER_MESSAGES,
  SUPPORT_ADMIN_REPLIES,
} from "./config";
import { randomName, randomEmail } from "./names";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function randomDateBetween(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

export type BackfillResult = {
  users: number;
  orders: number;
  deliveries: number;
  supportCases: number;
  activeCarts: number;
};

export async function runBackfill(): Promise<BackfillResult> {
  const result: BackfillResult = {
    users: 0,
    orders: 0,
    deliveries: 0,
    supportCases: 0,
    activeCarts: 0,
  };

  const [userCount] = await db
    .select({ total: count() })
    .from(users)
    .where(sql`${users.email} LIKE '%@sim.caspers.kitchen'`);

  if (Number(userCount.total) > 50) return result;

  const password = getSimPassword();
  const regions = Object.keys(DEFAULT_GEO_PROFILE);
  const thirtyDaysAgo = daysAgo(30);
  const now = new Date();

  const createdUserIds: Array<{ id: string; region: string; createdAt: Date }> =
    [];
  const targetUsers = randomBetween(350, 450);

  for (let i = 0; i < targetUsers; i++) {
    const { first, last, full } = randomName();
    const email = randomEmail(first, last);
    const region = pick(regions);
    const timezone = DEFAULT_GEO_PROFILE[region].timezone;
    const userCreatedAt = randomDateBetween(thirtyDaysAgo, now);

    const client = createApiClient();
    const res = await client.signUp({ name: full, email, password });
    if (!res.ok) continue;

    const userData = res.data as { user?: { id: string } };
    const userId = userData.user?.id;
    if (!userId) continue;

    await db
      .update(users)
      .set({
        timeZone: timezone,
        region,
        createdAt: userCreatedAt,
      })
      .where(sql`${users.id} = ${userId}`);

    createdUserIds.push({ id: userId, region, createdAt: userCreatedAt });
    result.users++;
  }

  if (createdUserIds.length === 0) return result;

  const menu = await db.select().from(menuItems);
  if (menu.length === 0) return result;

  const allDrivers = await db.select().from(drivers);
  const adminList = await db.select().from(admins);

  const targetOrders = randomBetween(1500, 2500);
  const orderUserPool = createdUserIds.filter((u) => u.createdAt < daysAgo(1));

  for (let i = 0; i < targetOrders && orderUserPool.length > 0; i++) {
    const user = pick(orderUserPool);
    const orderDate = randomDateBetween(
      new Date(Math.max(user.createdAt.getTime(), thirtyDaysAgo.getTime())),
      now,
    );

    const numItems = randomBetween(1, 5);
    const selectedItems = Array.from({ length: numItems }, () => pick(menu));
    const total = selectedItems.reduce(
      (sum, item) => sum + item.priceInCents * randomBetween(1, 3),
      0,
    );

    const statusRoll = Math.random();
    const status =
      statusRoll < 0.85
        ? "delivered"
        : statusRoll < 0.92
          ? "cancelled"
          : statusRoll < 0.96
            ? "pending"
            : "preparing";

    const [order] = await db
      .insert(orders)
      .values({
        userId: user.id,
        totalInCents: total,
        status,
        createdAt: orderDate,
        updatedAt: orderDate,
      })
      .returning();

    await db.insert(orderItems).values(
      selectedItems.map((item) => ({
        orderId: order.id,
        menuItemId: item.id,
        quantity: randomBetween(1, 3),
        priceInCents: item.priceInCents,
        createdAt: orderDate,
      })),
    );

    result.orders++;

    if (status === "delivered" && allDrivers.length > 0) {
      const driver = pick(allDrivers);
      const deliverStart = new Date(
        orderDate.getTime() + randomBetween(5, 15) * 60 * 1000,
      );
      const deliverEnd = new Date(
        deliverStart.getTime() + randomBetween(15, 45) * 60 * 1000,
      );

      await db.insert(deliveries).values({
        orderId: order.id,
        driverId: driver.id,
        status: "delivered",
        startedAt: deliverStart,
        deliveredAt: deliverEnd,
        createdAt: deliverStart,
        updatedAt: deliverEnd,
      });
      result.deliveries++;
    }
  }

  const targetCases = randomBetween(70, 120);
  const supportUserPool = createdUserIds.filter(
    (u) => u.createdAt < daysAgo(2),
  );

  for (let i = 0; i < targetCases && supportUserPool.length > 0; i++) {
    const user = pick(supportUserPool);
    const caseDate = randomDateBetween(
      new Date(Math.max(user.createdAt.getTime(), thirtyDaysAgo.getTime())),
      now,
    );

    const statusRoll = Math.random();
    const caseStatus =
      statusRoll < 0.5
        ? "closed"
        : statusRoll < 0.75
          ? "resolved"
          : statusRoll < 0.9
            ? "in_progress"
            : "open";

    const [supportCase] = await db
      .insert(supportCases)
      .values({
        userId: user.id,
        subject: pick(SUPPORT_SUBJECTS),
        status: caseStatus,
        createdAt: caseDate,
        updatedAt: caseDate,
      })
      .returning();

    const numMessages = randomBetween(1, 6);
    let msgTime = caseDate;

    for (let j = 0; j < numMessages; j++) {
      msgTime = new Date(msgTime.getTime() + randomBetween(5, 120) * 60 * 1000);
      const isAdmin = j % 2 === 1 && adminList.length > 0;

      await db.insert(supportMessages).values({
        caseId: supportCase.id,
        userId: isAdmin ? null : user.id,
        adminId: isAdmin ? pick(adminList).id : null,
        content: isAdmin
          ? pick(SUPPORT_ADMIN_REPLIES)
          : pick(SUPPORT_USER_MESSAGES),
        createdAt: msgTime,
      });
    }

    result.supportCases++;
  }

  const targetCarts = randomBetween(20, 40);
  const cartUserPool = createdUserIds.slice(-targetCarts * 2);

  for (let i = 0; i < targetCarts && i < cartUserPool.length; i++) {
    const user = cartUserPool[i];
    const cartDate = randomDateBetween(daysAgo(1), now);

    const [cart] = await db
      .insert(carts)
      .values({
        userId: user.id,
        createdAt: cartDate,
        updatedAt: cartDate,
      })
      .returning();

    const numItems = randomBetween(1, 4);
    for (let j = 0; j < numItems; j++) {
      const item = pick(menu);
      await db.insert(cartItems).values({
        cartId: cart.id,
        menuItemId: item.id,
        quantity: randomBetween(1, 3),
        createdAt: cartDate,
      });
    }

    result.activeCarts++;
  }

  return result;
}
