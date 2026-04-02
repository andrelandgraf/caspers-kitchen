import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "@/lib/auth/schema";
import { menuItems } from "@/lib/menu/schema";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: [
      "pending",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ],
  })
    .notNull()
    .default("pending"),
  totalInCents: integer("total_in_cents").notNull(),
  promotionId: uuid("promotion_id"),
  promoSnapshot: jsonb("promo_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: uuid("menu_item_id")
    .notNull()
    .references(() => menuItems.id),
  quantity: integer("quantity").notNull(),
  priceInCents: integer("price_in_cents").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
