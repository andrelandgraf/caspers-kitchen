import { configSchema, server } from "better-env/config-schema";

export const simulationConfig = configSchema("Simulation", {
  cronSecret: server({ env: "CRON_SECRET" }),
});
