import { initDb } from "./db/index.js";
import { HomewardWorkerService } from "./worker.js";
import { logger } from "./logger.js";

async function main() {
  logger.info("Starting Homeward Worker Process...");

  try {
    await initDb();
    logger.info("Database schema verified and ready.");

    const service = new HomewardWorkerService();
    await service.start();

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutdown signal received");
      await service.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err: any) {
    logger.fatal({ err: err.message }, "Fatal error starting worker");
    process.exit(1);
  }
}

main();
