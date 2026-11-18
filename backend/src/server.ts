import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { ensureSystemRbacAndSettings } from './modules/rbac/rbac.service.js';

async function bootstrap() {
  await connectDatabase(env.MONGODB_URI);
  await ensureSystemRbacAndSettings();

  const app = createApp();
  const server = app.listen(env.API_PORT, '0.0.0.0', () => {
    console.log(
      `[OPTRONIX API] Listening on http://0.0.0.0:${env.API_PORT} (${env.NODE_ENV})`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`[OPTRONIX API] Received ${signal}. Shutting down cleanly...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap().catch((err) => {
  console.error('[OPTRONIX API] Bootstrap failed:', err);
  process.exit(1);
});
