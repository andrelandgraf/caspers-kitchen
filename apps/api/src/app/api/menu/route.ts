import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { menuItems } from "@/lib/menu/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.available, true));
  return NextResponse.json(items);
}
