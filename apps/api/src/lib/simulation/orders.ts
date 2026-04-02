import type { SimUser } from "./users";
import { MENU_ITEM_DEFINITIONS } from "./config";

type MenuItem = {
  id: string;
  name: string;
  priceInCents: number;
  category: string;
};

function pickWeightedItem(items: MenuItem[]): MenuItem {
  const weights = items.map((item) => {
    const def = MENU_ITEM_DEFINITIONS.find((d) => d.name === item.name);
    return def?.popularityWeight ?? 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

export async function addItemsToCarts(
  activeUsers: SimUser[],
  count: number,
): Promise<number> {
  let added = 0;
  const usersToShop = activeUsers.slice(0, count);

  for (const user of usersToShop) {
    try {
      const menuRes = await user.client.get("/api/menu");
      if (!menuRes.ok) continue;

      const menuItemsList = menuRes.data as MenuItem[];
      if (menuItemsList.length === 0) continue;

      const itemCount = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < itemCount; i++) {
        const item = pickWeightedItem(menuItemsList);
        const quantity = 1 + Math.floor(Math.random() * 2);
        const res = await user.client.post("/api/cart", {
          menuItemId: item.id,
          quantity,
        });
        if (res.ok) added++;
      }
    } catch (err) {
      console.error("[sim] addItemsToCarts threw for", user.email, err);
    }
  }

  return added;
}

export async function checkoutCarts(
  activeUsers: SimUser[],
  count: number,
): Promise<{ checked: number; orderIds: string[] }> {
  let checked = 0;
  const orderIds: string[] = [];
  const candidates = activeUsers.slice(0, count);

  for (const user of candidates) {
    try {
      const cartRes = await user.client.get("/api/cart");
      if (!cartRes.ok) continue;

      const cartData = cartRes.data as {
        cart: { id: string } | null;
        items: unknown[];
      };
      if (!cartData.cart || cartData.items.length === 0) continue;

      if (Math.random() > 0.7) continue;

      const res = await user.client.post("/api/orders");
      if (res.ok) {
        checked++;
        const order = res.data as { id?: string };
        if (order.id) orderIds.push(order.id);
      }
    } catch (err) {
      console.error("[sim] checkoutCarts threw for", user.email, err);
    }
  }

  return { checked, orderIds };
}

export async function cancelSomeOrders(
  activeUsers: SimUser[],
  cancellationRate: number,
): Promise<number> {
  let cancelled = 0;

  for (const user of activeUsers) {
    try {
      const ordersRes = await user.client.get("/api/orders");
      if (!ordersRes.ok) continue;

      const userOrders = ordersRes.data as Array<{
        id: string;
        status: string;
      }>;
      const pendingOrders = userOrders.filter((o) => o.status === "pending");

      for (const order of pendingOrders) {
        if (Math.random() < cancellationRate) {
          const res = await user.client.post(`/api/orders/${order.id}/cancel`);
          if (res.ok) cancelled++;
        }
      }
    } catch (err) {
      console.error("[sim] cancelSomeOrders threw for", user.email, err);
    }
  }

  return cancelled;
}
