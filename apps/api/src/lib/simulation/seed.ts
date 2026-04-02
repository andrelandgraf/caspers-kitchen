import { db } from "@/lib/db/client";
import { menuItems } from "@/lib/menu/schema";
import { drivers } from "@/lib/drivers/schema";
import { admins } from "@/lib/support/schema";
import { simulationConfigs } from "./schema";
import { eq } from "drizzle-orm";
import {
  MENU_ITEM_DEFINITIONS,
  DRIVER_DEFINITIONS,
  ADMIN_DEFINITIONS,
  DEFAULT_BASE_RATES,
  DEFAULT_DIURNAL_PROFILE,
  DEFAULT_WEEKDAY_PROFILE,
  DEFAULT_GEO_PROFILE,
  DEFAULT_SAFETY_CAPS,
} from "./config";

export type SeedResult = {
  menuItems: number;
  drivers: number;
  admins: number;
  configCreated: boolean;
};

export async function runSeed(): Promise<SeedResult> {
  const result: SeedResult = {
    menuItems: 0,
    drivers: 0,
    admins: 0,
    configCreated: false,
  };

  const existingMenu = await db.select().from(menuItems);
  if (existingMenu.length === 0) {
    await db.insert(menuItems).values(
      MENU_ITEM_DEFINITIONS.map((item) => ({
        name: item.name,
        category: item.category,
        priceInCents: item.priceInCents,
        description: `Delicious ${item.name.toLowerCase()} from Casper's Kitchen`,
        available: true,
      })),
    );
    result.menuItems = MENU_ITEM_DEFINITIONS.length;
  }

  const existingDrivers = await db.select().from(drivers);
  if (existingDrivers.length === 0) {
    await db.insert(drivers).values(
      DRIVER_DEFINITIONS.map((d) => ({
        name: d.name,
        phone: d.phone,
        status: "available" as const,
      })),
    );
    result.drivers = DRIVER_DEFINITIONS.length;
  }

  const existingAdmins = await db.select().from(admins);
  if (existingAdmins.length === 0) {
    await db.insert(admins).values(
      ADMIN_DEFINITIONS.map((a) => ({
        name: a.name,
        email: a.email,
      })),
    );
    result.admins = ADMIN_DEFINITIONS.length;
  }

  const existingConfig = await db
    .select()
    .from(simulationConfigs)
    .where(eq(simulationConfigs.active, "active"))
    .limit(1);

  if (existingConfig.length === 0) {
    await db.insert(simulationConfigs).values({
      version: 1,
      baseRates: DEFAULT_BASE_RATES,
      diurnalProfile: DEFAULT_DIURNAL_PROFILE,
      weekdayProfile: DEFAULT_WEEKDAY_PROFILE,
      geoProfile: DEFAULT_GEO_PROFILE,
      safetyCaps: DEFAULT_SAFETY_CAPS,
      active: "active",
    });
    result.configCreated = true;
  }

  return result;
}
