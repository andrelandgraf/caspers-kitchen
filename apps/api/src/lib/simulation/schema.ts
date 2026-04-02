import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export type DiurnalProfile = Record<string, number>;
export type WeekdayProfile = Record<string, number>;
export type GeoProfile = Record<string, { weight: number; timezone: string }>;

export type BaseRates = {
  signupsPerTick: number;
  activeUsersPerTick: number;
  cartAddsPerTick: number;
  checkoutsPerTick: number;
  cancellationRate: number;
  supportCaseRate: number;
};

export type SafetyCaps = {
  maxActionsPerTick: number;
  maxSignupsPerDay: number;
};

export type RunCounters = {
  signups: number;
  signIns: number;
  cartAdds: number;
  checkouts: number;
  cancellations: number;
  supportCases: number;
  supportMessages: number;
  ordersProgressed: number;
  driversAssigned: number;
  deliveriesProgressed: number;
  adminReplies: number;
  cleanups: number;
};

export type ComputedMultipliers = {
  diurnal: Record<string, number>;
  weekday: number;
  promo: Record<string, number>;
  geo: Record<string, number>;
};

export const simulationConfigs = pgTable("simulation_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull().default(1),
  baseRates: jsonb("base_rates").notNull().$type<BaseRates>(),
  diurnalProfile: jsonb("diurnal_profile").notNull().$type<DiurnalProfile>(),
  weekdayProfile: jsonb("weekday_profile").notNull().$type<WeekdayProfile>(),
  geoProfile: jsonb("geo_profile").notNull().$type<GeoProfile>(),
  safetyCaps: jsonb("safety_caps").notNull().$type<SafetyCaps>(),
  active: text("active", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const simulationRuns = pgTable("simulation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  configId: uuid("config_id").references(() => simulationConfigs.id),
  status: text("status", {
    enum: ["running", "completed", "failed"],
  })
    .notNull()
    .default("running"),
  computedMultipliers: jsonb(
    "computed_multipliers",
  ).$type<ComputedMultipliers>(),
  counters: jsonb("counters").$type<RunCounters>(),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});
