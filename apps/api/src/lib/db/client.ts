import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createLakebasePool } from "@/lib/lakebase";
import * as authSchema from "@/lib/auth/schema";
import * as menuSchema from "@/lib/menu/schema";
import * as cartSchema from "@/lib/cart/schema";
import * as ordersSchema from "@/lib/orders/schema";
import * as driversSchema from "@/lib/drivers/schema";
import * as deliveriesSchema from "@/lib/deliveries/schema";
import * as supportSchema from "@/lib/support/schema";
import * as simulationSchema from "@/lib/simulation/schema";
import * as promotionsSchema from "@/lib/promotions/schema";

const schema = {
  ...authSchema,
  ...menuSchema,
  ...cartSchema,
  ...ordersSchema,
  ...driversSchema,
  ...deliveriesSchema,
  ...supportSchema,
  ...simulationSchema,
  ...promotionsSchema,
};

function createPool(): Pool {
  if (process.env.PGHOST) {
    return createLakebasePool();
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Either PGHOST (for Lakebase) or DATABASE_URL must be set");
  }
  return new Pool({ connectionString: url });
}

const pool = createPool();

const db = drizzle({ client: pool, schema });

export { db };
