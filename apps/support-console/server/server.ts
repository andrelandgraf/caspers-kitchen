import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { setupSupportRoutes } from './routes/support-routes';

createApp({
  plugins: [server({ autoStart: false }), analytics(), lakebase()],
})
  .then(async (appkit) => {
    await setupSupportRoutes(appkit);
    await appkit.server.start();
  })
  .catch(console.error);
