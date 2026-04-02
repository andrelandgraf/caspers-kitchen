import type { SimUser } from "./users";
import { SUPPORT_SUBJECTS, SUPPORT_USER_MESSAGES } from "./config";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function createSupportCases(
  activeUsers: SimUser[],
  rate: number,
): Promise<{ created: number; caseIds: string[] }> {
  let created = 0;
  const caseIds: string[] = [];

  for (const user of activeUsers) {
    try {
      if (Math.random() > rate) continue;

      const subject = pick(SUPPORT_SUBJECTS);
      const res = await user.client.post("/api/support", { subject });
      if (!res.ok) continue;

      const caseData = res.data as { id?: string };
      if (!caseData.id) continue;

      created++;
      caseIds.push(caseData.id);

      const message = pick(SUPPORT_USER_MESSAGES);
      await user.client.post(`/api/support/${caseData.id}/messages`, {
        content: message,
      });
    } catch (err) {
      console.error("[sim] createSupportCases threw for", user.email, err);
    }
  }

  return { created, caseIds };
}

export async function sendUserFollowUps(
  activeUsers: SimUser[],
): Promise<number> {
  let sent = 0;

  for (const user of activeUsers) {
    try {
      if (Math.random() > 0.4) continue;

      const casesRes = await user.client.get("/api/support");
      if (!casesRes.ok) continue;

      const cases = casesRes.data as Array<{ id: string; status: string }>;
      const openCases = cases.filter(
        (c) => c.status === "open" || c.status === "in_progress",
      );

      for (const supportCase of openCases) {
        if (Math.random() > 0.5) continue;

        const message = pick(SUPPORT_USER_MESSAGES);
        const res = await user.client.post(
          `/api/support/${supportCase.id}/messages`,
          { content: message },
        );
        if (res.ok) sent++;
      }
    } catch (err) {
      console.error("[sim] sendUserFollowUps threw for", user.email, err);
    }
  }

  return sent;
}
