import { ethers } from "ethers";
import { novaProvider } from "../providers.js";
import { NovaEntryContractAbi } from "../abis/index.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { migrationsTable } from "../db/schema.js";
import { monitoringQueue } from "./queueManager.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";

let lastScannedBlock: number | null = null;

export async function processDiscovery(): Promise<number> {
  if (config.NOVA_ENTRY_CONTRACT === ethers.ZeroAddress) {
    logger.debug("NovaEntryContract address not configured yet, skipping discovery scan");
    return 0;
  }

  const contract = new ethers.Contract(config.NOVA_ENTRY_CONTRACT, NovaEntryContractAbi, novaProvider);

  const currentBlock = await novaProvider.getBlockNumber();
  if (lastScannedBlock === null) {
    // Scan last 1000 blocks on startup
    lastScannedBlock = Math.max(0, currentBlock - 1000);
  }

  if (lastScannedBlock >= currentBlock) {
    return 0;
  }

  const fromBlock = lastScannedBlock + 1;
  const toBlock = currentBlock;

  logger.info({ fromBlock, toBlock }, "Scanning for new migration jobs on Nova");

  const filter = contract.filters.MigrationJobCreated();
  const events = await contract.queryFilter(filter, fromBlock, toBlock);

  let newJobsCount = 0;

  for (const event of events) {
    if (!("args" in event)) continue;
    const [
      jobId,
      messagePosition,
      depositor,
      beneficiary,
      amount,
      maxDeductions,
      executorReward,
      minDeliveryThreshold,
    ] = event.args;

    const existing = await db
      .select()
      .from(migrationsTable)
      .where(eq(migrationsTable.jobId, jobId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(migrationsTable).values({
        jobId,
        depositor,
        beneficiary,
        principalAmount: amount.toString(),
        maxDeductions: maxDeductions.toString(),
        executorReward: executorReward.toString(),
        minDeliveryThreshold: minDeliveryThreshold.toString(),
        messagePosition: Number(messagePosition),
        novaTxHash: event.transactionHash,
        novaBlockNumber: event.blockNumber,
        status: "DISCOVERED",
      });

      await monitoringQueue.add(
        "monitor-challenge",
        { jobId },
        { jobId: `monitor-${jobId}` }
      );

      logger.info({ jobId, depositor, amount: ethers.formatEther(amount) }, "New migration job discovered and enqueued");
      newJobsCount++;
    }
  }

  lastScannedBlock = toBlock;
  return newJobsCount;
}
