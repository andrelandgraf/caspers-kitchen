import { db } from "@/lib/db/client";
import { simulationConfigs, simulationRuns } from "./schema";
import type { RunCounters, ComputedMultipliers } from "./schema";
import { promotions } from "@/lib/promotions/schema";
import { eq, desc, and, lte, gte } from "drizzle-orm";
import {
  computeTickShape,
  getDefaults,
  type TrafficConfig,
} from "./traffic-model";
import { signUpNewUsers, signInReturningUsers, type SimUser } from "./users";
import { addItemsToCarts, checkoutCarts, cancelSomeOrders } from "./orders";
import { createSupportCases, sendUserFollowUps } from "./support";
import {
  progressOrderStates,
  assignDrivers,
  progressDeliveries,
  adminRepliesAndResolution,
  cleanupAndAutoClose,
} from "./internal";

export type TickResult = {
  runId: string;
  status: "completed" | "failed";
  counters: RunCounters;
  multipliers: ComputedMultipliers;
  durationMs: number;
  error?: string;
};

async function loadConfig(): Promise<TrafficConfig> {
  const config = await db
    .select()
    .from(simulationConfigs)
    .where(eq(simulationConfigs.active, "active"))
    .orderBy(desc(simulationConfigs.version))
    .limit(1)
    .then((rows) => rows[0]);

  if (!config) return getDefaults();

  return {
    baseRates: config.baseRates,
    diurnalProfile: config.diurnalProfile,
    weekdayProfile: config.weekdayProfile,
    geoProfile: config.geoProfile,
    safetyCaps: config.safetyCaps,
  };
}

async function getActivePromoMultipliers(): Promise<Record<string, number>> {
  const now = new Date();
  const activePromos = await db
    .select({
      region: promotions.region,
      trafficMultiplier: promotions.trafficMultiplier,
    })
    .from(promotions)
    .where(and(lte(promotions.startsAt, now), gte(promotions.endsAt, now)));

  const regionMultipliers: Record<string, number> = {};
  for (const promo of activePromos) {
    const region = promo.region ?? "global";
    const multiplier = (promo.trafficMultiplier ?? 100) / 100;
    regionMultipliers[region] = Math.max(
      regionMultipliers[region] ?? 1.0,
      multiplier,
    );
  }

  return regionMultipliers;
}

export async function runTick(): Promise<TickResult> {
  const startTime = Date.now();
  const now = new Date();

  const config = await loadConfig();
  const activeConfigRow = await db
    .select()
    .from(simulationConfigs)
    .where(eq(simulationConfigs.active, "active"))
    .orderBy(desc(simulationConfigs.version))
    .limit(1)
    .then((rows) => rows[0]);

  const [run] = await db
    .insert(simulationRuns)
    .values({
      configId: activeConfigRow?.id ?? null,
      status: "running",
      startedAt: now,
    })
    .returning();

  const counters: RunCounters = {
    signups: 0,
    signIns: 0,
    cartAdds: 0,
    checkouts: 0,
    cancellations: 0,
    supportCases: 0,
    supportMessages: 0,
    ordersProgressed: 0,
    driversAssigned: 0,
    deliveriesProgressed: 0,
    adminReplies: 0,
    cleanups: 0,
  };

  const errors: string[] = [];
  let multipliers: ComputedMultipliers = {
    diurnal: {},
    weekday: 1,
    promo: {},
    geo: {},
  };

  async function step<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sim] step "${name}" failed:`, msg);
      errors.push(`${name}: ${msg}`);
      return undefined;
    }
  }

  const promoMultipliers = await step("loadPromos", () =>
    getActivePromoMultipliers(),
  );
  const shape = promoMultipliers
    ? computeTickShape(config, promoMultipliers, now)
    : computeTickShape(config, {}, now);
  multipliers = shape.multipliers;

  const newUsers = await step("signUpNewUsers", () =>
    signUpNewUsers(shape.signups, shape.regionWeights),
  );
  counters.signups = newUsers?.length ?? 0;

  const returningUsers = await step("signInReturningUsers", () =>
    signInReturningUsers(shape.activeUsers),
  );
  counters.signIns = returningUsers?.length ?? 0;

  const allActiveUsers: SimUser[] = [
    ...(newUsers ?? []),
    ...(returningUsers ?? []),
  ];

  const cartAdds = await step("addItemsToCarts", () =>
    addItemsToCarts(allActiveUsers, shape.cartAdds),
  );
  counters.cartAdds = cartAdds ?? 0;

  const checkout = await step("checkoutCarts", () =>
    checkoutCarts(allActiveUsers, shape.checkouts),
  );
  counters.checkouts = checkout?.checked ?? 0;

  const cancellations = await step("cancelSomeOrders", () =>
    cancelSomeOrders(allActiveUsers, shape.cancellationRate),
  );
  counters.cancellations = cancellations ?? 0;

  const ordersProgressed = await step(
    "progressOrderStates",
    progressOrderStates,
  );
  counters.ordersProgressed = ordersProgressed ?? 0;

  const driversAssigned = await step("assignDrivers", assignDrivers);
  counters.driversAssigned = driversAssigned ?? 0;

  const deliveriesProgressed = await step(
    "progressDeliveries",
    progressDeliveries,
  );
  counters.deliveriesProgressed = deliveriesProgressed ?? 0;

  const casesCreated = await step("createSupportCases", () =>
    createSupportCases(allActiveUsers, shape.supportCaseRate),
  );
  counters.supportCases = casesCreated?.created ?? 0;

  const supportMessages = await step("sendUserFollowUps", () =>
    sendUserFollowUps(allActiveUsers),
  );
  counters.supportMessages = supportMessages ?? 0;

  const adminReplies = await step(
    "adminRepliesAndResolution",
    adminRepliesAndResolution,
  );
  counters.adminReplies = adminReplies ?? 0;

  const cleanups = await step("cleanupAndAutoClose", cleanupAndAutoClose);
  counters.cleanups = cleanups ?? 0;

  const error = errors.length > 0 ? errors.join("; ") : undefined;

  const finishedAt = new Date();
  const status: "completed" | "failed" =
    errors.length > 0 && errors.length >= 12 ? "failed" : "completed";

  await db
    .update(simulationRuns)
    .set({
      status,
      counters,
      computedMultipliers: multipliers,
      errorSummary: error ?? null,
      finishedAt,
    })
    .where(eq(simulationRuns.id, run.id));

  return {
    runId: run.id,
    status,
    counters,
    multipliers,
    durationMs: Date.now() - startTime,
    error,
  };
}
