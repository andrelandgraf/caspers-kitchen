import { db } from "@/lib/db/client";
import { simulationConfigs, simulationRuns } from "./schema";
import type { RunCounters, ComputedMultipliers } from "./schema";
import { promotions } from "@/lib/promotions/schema";
import { eq, desc, and, lte, gte, isNull, or } from "drizzle-orm";
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

  let error: string | undefined;
  let multipliers: ComputedMultipliers = {
    diurnal: {},
    weekday: 1,
    promo: {},
    geo: {},
  };

  try {
    const promoMultipliers = await getActivePromoMultipliers();
    const shape = computeTickShape(config, promoMultipliers, now);
    multipliers = shape.multipliers;

    // Step 1: Sign up new users via API
    const newUsers = await signUpNewUsers(shape.signups, shape.regionWeights);
    counters.signups = newUsers.length;

    // Step 2: Sign in returning users via API
    const returningUsers = await signInReturningUsers(shape.activeUsers);
    counters.signIns = returningUsers.length;

    const allActiveUsers: SimUser[] = [...newUsers, ...returningUsers];

    // Step 3: Add items to carts via API
    counters.cartAdds = await addItemsToCarts(allActiveUsers, shape.cartAdds);

    // Step 4: Checkout carts via API
    const { checked } = await checkoutCarts(allActiveUsers, shape.checkouts);
    counters.checkouts = checked;

    // Step 5: Cancel some orders via API
    counters.cancellations = await cancelSomeOrders(
      allActiveUsers,
      shape.cancellationRate,
    );

    // Step 6: Progress order states (direct DB)
    counters.ordersProgressed = await progressOrderStates();

    // Step 7: Assign drivers (direct DB)
    counters.driversAssigned = await assignDrivers();

    // Step 8: Progress deliveries (direct DB)
    counters.deliveriesProgressed = await progressDeliveries();

    // Step 9: Create support cases via API
    const { created: casesCreated } = await createSupportCases(
      allActiveUsers,
      shape.supportCaseRate,
    );
    counters.supportCases = casesCreated;

    // Step 10: User follow-up messages via API
    counters.supportMessages = await sendUserFollowUps(allActiveUsers);

    // Step 11: Admin replies and resolution (direct DB)
    counters.adminReplies = await adminRepliesAndResolution();

    // Step 12: Cleanup (direct DB)
    counters.cleanups = await cleanupAndAutoClose();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date();
  const status = error ? "failed" : "completed";

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
