import type {
  BaseRates,
  DiurnalProfile,
  WeekdayProfile,
  GeoProfile,
  SafetyCaps,
} from "./schema";
import {
  DEFAULT_BASE_RATES,
  DEFAULT_DIURNAL_PROFILE,
  DEFAULT_WEEKDAY_PROFILE,
  DEFAULT_GEO_PROFILE,
  DEFAULT_SAFETY_CAPS,
} from "./config";

export type TrafficConfig = {
  baseRates: BaseRates;
  diurnalProfile: DiurnalProfile;
  weekdayProfile: WeekdayProfile;
  geoProfile: GeoProfile;
  safetyCaps: SafetyCaps;
};

export type TickShape = {
  signups: number;
  activeUsers: number;
  cartAdds: number;
  checkouts: number;
  cancellationRate: number;
  supportCaseRate: number;
  regionWeights: Record<string, number>;
  multipliers: {
    diurnal: Record<string, number>;
    weekday: number;
    promo: Record<string, number>;
    geo: Record<string, number>;
  };
};

export function getDefaults(): TrafficConfig {
  return {
    baseRates: DEFAULT_BASE_RATES,
    diurnalProfile: DEFAULT_DIURNAL_PROFILE,
    weekdayProfile: DEFAULT_WEEKDAY_PROFILE,
    geoProfile: DEFAULT_GEO_PROFILE,
    safetyCaps: DEFAULT_SAFETY_CAPS,
  };
}

function getLocalHour(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(utcDate), 10);
}

function getLocalDayOfWeek(utcDate: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return dayMap[formatter.format(utcDate)] ?? 0;
}

function diurnalMultiplier(profile: DiurnalProfile, hour: number): number {
  return profile[String(hour)] ?? 1.0;
}

function weekdayMultiplier(profile: WeekdayProfile, day: number): number {
  return profile[String(day)] ?? 1.0;
}

function noise(): number {
  return 0.8 + Math.random() * 0.4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function poissonSample(lambda: number): number {
  if (lambda <= 0) return 0;
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

export function computeTickShape(
  config: TrafficConfig,
  activePromoRegions: Record<string, number>,
  now: Date = new Date(),
): TickShape {
  const { baseRates, diurnalProfile, weekdayProfile, geoProfile, safetyCaps } =
    config;
  const regions = Object.keys(geoProfile);

  const diurnalByRegion: Record<string, number> = {};
  const geoWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const region of regions) {
    const { timezone, weight } = geoProfile[region];
    const localHour = getLocalHour(now, timezone);
    const localDay = getLocalDayOfWeek(now, timezone);

    const dm = diurnalMultiplier(diurnalProfile, localHour);
    const wm = weekdayMultiplier(weekdayProfile, localDay);
    const pm = activePromoRegions[region] ?? 1.0;

    const regionMultiplier = dm * wm * pm * weight * noise();
    geoWeights[region] = regionMultiplier;
    diurnalByRegion[region] = dm;
    totalWeight += regionMultiplier;
  }

  const avgMultiplier = regions.length > 0 ? totalWeight / regions.length : 1.0;

  const rawSignups = baseRates.signupsPerTick * avgMultiplier;
  const rawActiveUsers = baseRates.activeUsersPerTick * avgMultiplier;
  const rawCartAdds = baseRates.cartAddsPerTick * avgMultiplier;
  const rawCheckouts = baseRates.checkoutsPerTick * avgMultiplier;

  const cap = safetyCaps.maxActionsPerTick;

  const primaryRegion = regions[0] ?? "us_east";
  const primaryTz = geoProfile[primaryRegion]?.timezone ?? "America/New_York";
  const primaryDay = getLocalDayOfWeek(now, primaryTz);
  const wm = weekdayMultiplier(weekdayProfile, primaryDay);

  return {
    signups: clamp(poissonSample(rawSignups), 0, Math.ceil(cap * 0.1)),
    activeUsers: clamp(poissonSample(rawActiveUsers), 1, cap),
    cartAdds: clamp(poissonSample(rawCartAdds), 0, Math.ceil(cap * 0.4)),
    checkouts: clamp(poissonSample(rawCheckouts), 0, Math.ceil(cap * 0.3)),
    cancellationRate: baseRates.cancellationRate,
    supportCaseRate: baseRates.supportCaseRate,
    regionWeights: geoWeights,
    multipliers: {
      diurnal: diurnalByRegion,
      weekday: wm,
      promo: activePromoRegions,
      geo: Object.fromEntries(regions.map((r) => [r, geoProfile[r].weight])),
    },
  };
}

export function pickRegion(regionWeights: Record<string, number>): string {
  const entries = Object.entries(regionWeights);
  const total = entries.reduce((sum, [, w]) => sum + Math.max(w, 0), 0);
  if (total <= 0) return entries[0]?.[0] ?? "us_east";

  let roll = Math.random() * total;
  for (const [region, weight] of entries) {
    roll -= Math.max(weight, 0);
    if (roll <= 0) return region;
  }
  return entries[entries.length - 1][0];
}
