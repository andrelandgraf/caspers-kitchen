import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "@/lib/auth/schema";
import { orders } from "@/lib/orders/schema";

export type DiscountStrategy =
  | { type: "percentage_off"; percent: number }
  | { type: "fixed_amount_off"; amountInCents: number }
  | { type: "free_delivery" };

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  discountStrategy: jsonb("discount_strategy")
    .notNull()
    .$type<DiscountStrategy>(),
  region: text("region"),
  category: text("category"),
  trafficMultiplier: integer("traffic_multiplier").notNull().default(100),
  maxRedemptions: integer("max_redemptions"),
  currentRedemptions: integer("current_redemptions").notNull().default(0),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const promotionRedemptions = pgTable(
  "promotion_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("promotion_user_order_idx").on(
      table.promotionId,
      table.userId,
      table.orderId,
    ),
  ],
);
