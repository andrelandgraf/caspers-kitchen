import { db } from "@/lib/db/client";
import { users } from "@/lib/auth/schema";
import { orders } from "@/lib/orders/schema";
import { eq, desc, gte, sql, count } from "drizzle-orm";
import { createApiClient, type ApiClient } from "./api-client";
import { getSimPassword, DEFAULT_GEO_PROFILE } from "./config";
import { randomName, randomEmail } from "./names";
import { pickRegion } from "./traffic-model";

export type SimUser = {
  id: string;
  email: string;
  name: string;
  region: string | null;
  timeZone: string | null;
  client: ApiClient;
};

export async function signUpNewUsers(
  count_: number,
  regionWeights: Record<string, number>,
): Promise<SimUser[]> {
  const results: SimUser[] = [];
  const password = getSimPassword();

  for (let i = 0; i < count_; i++) {
    try {
      const { first, last, full } = randomName();
      const email = randomEmail(first, last);
      const region = pickRegion(regionWeights);
      const timezone =
        DEFAULT_GEO_PROFILE[region]?.timezone ?? "America/New_York";

      const client = createApiClient();
      const res = await client.signUp({ name: full, email, password });

      if (!res.ok) {
        console.error(
          "[sim] signup failed for",
          email,
          JSON.stringify(res.data),
        );
        continue;
      }

      const userData = res.data as { user?: { id: string } };
      const userId = userData.user?.id;
      if (!userId) continue;

      await db
        .update(users)
        .set({ timeZone: timezone, region })
        .where(eq(users.id, userId));

      results.push({
        id: userId,
        email,
        name: full,
        region,
        timeZone: timezone,
        client,
      });
    } catch (err) {
      console.error("[sim] signup threw for user", i, err);
    }
  }

  return results;
}

export async function signInReturningUsers(count_: number): Promise<SimUser[]> {
  const password = getSimPassword();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const simUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      region: users.region,
      timeZone: users.timeZone,
    })
    .from(users)
    .where(sql`${users.email} LIKE '%@sim.caspers.kitchen'`);

  if (simUsers.length === 0) return [];

  const orderCounts = await db
    .select({
      userId: orders.userId,
      orderCount: count(),
      latestOrder: sql<Date>`MAX(${orders.createdAt})`,
    })
    .from(orders)
    .groupBy(orders.userId);

  const orderMap = new Map(
    orderCounts.map((o) => [
      o.userId,
      { count: Number(o.orderCount), latest: o.latestOrder },
    ]),
  );

  const weighted = simUsers.map((u) => {
    const stats = orderMap.get(u.id);
    let weight = 1;

    if (stats) {
      if (stats.latest && stats.latest > threeDaysAgo) weight += 3;
      else if (stats.latest && stats.latest > sevenDaysAgo) weight += 1;

      if (stats.count >= 5) weight *= 3;
      else if (stats.count >= 2) weight *= 2;
    }

    return { user: u, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const selected: typeof simUsers = [];
  const target = Math.min(count_, simUsers.length);
  const usedIds = new Set<string>();

  while (selected.length < target && usedIds.size < simUsers.length) {
    let roll = Math.random() * totalWeight;
    for (const { user, weight } of weighted) {
      if (usedIds.has(user.id)) continue;
      roll -= weight;
      if (roll <= 0) {
        selected.push(user);
        usedIds.add(user.id);
        break;
      }
    }
    if (selected.length === 0 && usedIds.size === 0) break;
  }

  const results: SimUser[] = [];

  for (const user of selected) {
    try {
      const client = createApiClient();
      const res = await client.signIn({ email: user.email, password });
      if (!res.ok) continue;

      results.push({
        id: user.id,
        email: user.email,
        name: user.name,
        region: user.region,
        timeZone: user.timeZone,
        client,
      });
    } catch (err) {
      console.error("[sim] signIn threw for", user.email, err);
    }
  }

  return results;
}
