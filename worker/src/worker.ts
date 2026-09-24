import { Worker } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./queues/queueManager.js";
import { processDiscovery } from "./queues/discovery.js";
import { processMonitoring } from "./queues/monitoring.js";
import { processExecution } from "./queues/execution.js";
import { processRetryable } from "./queues/retryable.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export class HomewardWorkerService {
  private monitoringWorker!: Worker;
  private executionWorker!: Worker;
  private retryableWorker!: Worker;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info("Initializing Homeward background worker service...");

    // 1. Monitoring Worker
    this.monitoringWorker = new Worker(
      QUEUE_NAMES.MONITORING,
      async (job) => {
        await processMonitoring(job);
      },
      { connection: redisConnection, concurrency: 5 }
    );

    // 2. Execution Worker
    this.executionWorker = new Worker(
      QUEUE_NAMES.EXECUTION,
      async (job) => {
        await processExecution(job);
      },
      { connection: redisConnection, concurrency: 2 } // Keep low to prevent nonce clashes on worker wallet
    );

    // 3. Retryable Worker
    this.retryableWorker = new Worker(
      QUEUE_NAMES.RETRYABLE,
      async (job) => {
        await processRetryable(job);
      },
      { connection: redisConnection, concurrency: 5 }
    );

    // Worker error listeners
    for (const [name, w] of [
      ["Monitoring", this.monitoringWorker],
      ["Execution", this.executionWorker],
      ["Retryable", this.retryableWorker],
    ] as const) {
      w.on("failed", (job, err) => {
        logger.error({ queue: name, jobId: job?.id, err: err.message }, "Job failed");
      });
      w.on("completed", (job) => {
        logger.info({ queue: name, jobId: job?.id }, "Job completed successfully");
      });
    }

    // 4. Start Discovery Poller
    logger.info({ intervalMs: config.DISCOVERY_POLL_INTERVAL_MS }, "Starting event discovery loop");
    await this.runDiscoveryTick();
    this.discoveryInterval = setInterval(async () => {
      await this.runDiscoveryTick();
    }, config.DISCOVERY_POLL_INTERVAL_MS);

    logger.info("Homeward worker service is active and listening for migration events!");
  }

  private async runDiscoveryTick() {
    try {
      await processDiscovery();
    } catch (err: any) {
      logger.error({ err: err.message }, "Error during discovery scan tick");
    }
  }

  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    logger.info("Stopping Homeward worker service...");
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);

    await Promise.all([
      this.monitoringWorker?.close(),
      this.executionWorker?.close(),
      this.retryableWorker?.close(),
    ]);

    await redisConnection.quit();
    logger.info("Homeward worker service stopped cleanly.");
  }
}
