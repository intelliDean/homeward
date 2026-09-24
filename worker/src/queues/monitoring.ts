import { Job } from "bullmq";
import { ethers } from "ethers";
import { ChildTransactionReceipt, ChildToParentMessageStatus } from "@arbitrum/sdk";
import { novaProvider, l1Provider } from "../providers.js";
import { db } from "../db/index.js";
import { migrationsTable } from "../db/schema.js";
import { executionQueue } from "./queueManager.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";

export async function processMonitoring(job: Job<{ jobId: string }>) {
  const { jobId } = job.data;

  const records = await db
    .select()
    .from(migrationsTable)
    .where(eq(migrationsTable.jobId, jobId))
    .limit(1);

  if (records.length === 0) {
    logger.warn({ jobId }, "Job record not found during monitoring");
    return;
  }

  const record = records[0];

  logger.info({ jobId, txHash: record.novaTxHash }, "Checking bridge challenge window status");

  const receipt = await novaProvider.getTransactionReceipt(record.novaTxHash);
  if (!receipt) {
    logger.warn({ jobId, txHash: record.novaTxHash }, "Nova tx receipt not found yet");
    throw new Error(`Receipt for ${record.novaTxHash} not found yet`);
  }

  const childReceipt = new ChildTransactionReceipt(receipt as any);
  const messages = await childReceipt.getChildToParentMessages(l1Provider as any);

  if (messages.length === 0) {
    logger.error({ jobId }, "No L2-to-L1 messages found in transaction");
    throw new Error(`No child-to-parent messages found for job ${jobId}`);
  }

  // Find message matching messagePosition or first message
  const msg = messages[0];
  const status = await msg.status(l1Provider as any);

  if (status === ChildToParentMessageStatus.CONFIRMED) {
    logger.info({ jobId }, "Challenge period passed! Ready for L1 Outbox claim");

    await db
      .update(migrationsTable)
      .set({
        status: "CHALLENGE_PASSED",
        updatedAt: new Date(),
      })
      .where(eq(migrationsTable.jobId, jobId));

    await executionQueue.add(
      "execute-claim",
      { jobId },
      { jobId: `exec-${jobId}` }
    );
  } else if (status === ChildToParentMessageStatus.EXECUTED) {
    logger.info({ jobId }, "Outbox message already executed on L1. Enqueuing for forwarding");

    await executionQueue.add(
      "forward-ticket",
      { jobId, outboxAlreadyClaimed: true },
      { jobId: `forward-${jobId}` }
    );
  } else {
    logger.info({ jobId }, "Challenge window still active. Retrying later");
    // Reschedule in 1 minute
    await job.moveToDelayed(Date.now() + 60000, job.token);
  }
}
