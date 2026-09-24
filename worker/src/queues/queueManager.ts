import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

export const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  DISCOVERY: "homeward-discovery",
  MONITORING: "homeward-monitoring",
  EXECUTION: "homeward-execution",
  RETRYABLE: "homeward-retryable",
} as const;

export const discoveryQueue = new Queue(QUEUE_NAMES.DISCOVERY, {
  connection: redisConnection,
});

export const monitoringQueue = new Queue(QUEUE_NAMES.MONITORING, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
  },
});

export const executionQueue = new Queue(QUEUE_NAMES.EXECUTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 15000,
    },
  },
});

export const retryableQueue = new Queue(QUEUE_NAMES.RETRYABLE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 20,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
  },
});
