import { NextResponse } from "next/server";
import { simulationConfig } from "./env";

export function verifyCronSecret(request: Request): NextResponse | null {
  const secret = simulationConfig.server.cronSecret;

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
