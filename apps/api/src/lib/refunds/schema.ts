import { pgTable, text, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/lib/auth/schema";
import { orders } from "@/lib/orders/schema";
import { supportCases } from "@/lib/support/schema";

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  supportCaseId: uuid("support_case_id").references(() => supportCases.id, {
    onDelete: "set null",
  }),
  amountInCents: integer("amount_in_cents").notNull(),
  reason: text("reason").notNull(),
  status: text("status", {
    enum: ["pending", "processed", "failed"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const credits = pgTable("credits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  supportCaseId: uuid("support_case_id").references(() => supportCases.id, {
    onDelete: "set null",
  }),
  amountInCents: integer("amount_in_cents").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
