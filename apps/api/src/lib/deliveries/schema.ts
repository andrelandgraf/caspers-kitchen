import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { orders } from "@/lib/orders/schema";
import { drivers } from "@/lib/drivers/schema";

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id),
  status: text("status", {
    enum: ["assigned", "picked_up", "in_transit", "delivered", "failed"],
  })
    .notNull()
    .default("assigned"),
  startedAt: timestamp("started_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
