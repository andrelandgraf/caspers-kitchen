import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  status: text("status", {
    enum: ["available", "on_delivery", "offline"],
  })
    .notNull()
    .default("offline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
