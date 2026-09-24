import { Job } from "bullmq";
import { ParentTransactionReceipt, ParentToChildMessageStatus } from "@arbitrum/sdk";
import { l1Provider, arbOneProvider } from "../providers.js";
import { db } from "../db/index.js";
import { migrationsTable } from "../db/schema.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";

export async function processRetryable(job: Job<{ jobId: string; ticketId: string }>) {
  const { jobId, ticketId } = job.data;

  const records = await db
    .select()
    .from(migrationsTable)
    .where(eq(migrationsTable.jobId, jobId))
    .limit(1);

  if (records.length === 0) {
    logger.warn({ jobId }, "Job record not found during retryable tracking");
    return;
  }

  const record = records[0];
  if (!record.forwardTxHash) {
    logger.warn({ jobId }, "Forward tx hash not found for retryable tracking");
    return;
  }

  logger.info({ jobId, ticketId, forwardTxHash: record.forwardTxHash }, "Tracking retryable ticket on Arbitrum One");

  const forwardReceipt = await l1Provider.getTransactionReceipt(record.forwardTxHash);
  if (!forwardReceipt) {
    throw new Error(`Receipt for forward tx ${record.forwardTxHash} not found yet`);
  }

  const parentReceipt = new ParentTransactionReceipt(forwardReceipt as any);
  const messages = await parentReceipt.getParentToChildMessages(arbOneProvider as any);

  if (messages.length === 0) {
    logger.warn({ jobId }, "No parent-to-child messages found in forward transaction");
    return;
  }

  const msg = messages[0];
  const status = await msg.status();

  if (status === ParentToChildMessageStatus.REDEEMED) {
    logger.info({ jobId, ticketId, beneficiary: record.beneficiary }, "Migration SUCCESS! Retryable ticket redeemed and ETH delivered on Arbitrum One");

    await db
      .update(migrationsTable)
      .set({
        status: "COMPLETED",
        updatedAt: new Date(),
      })
      .where(eq(migrationsTable.jobId, jobId));
  } else if (status === ParentToChildMessageStatus.FUNDS_DEPOSITED_ON_CHILD) {
    // Ticket deposited on L2, waiting for auto-redemption or manual redeem
    logger.info({ jobId }, "Funds deposited on child, awaiting execution. Retrying in 15 seconds");
    await job.moveToDelayed(Date.now() + 15000, job.token);
  } else {
    logger.info({ jobId, status }, "Ticket still in progress. Checking again shortly");
    await job.moveToDelayed(Date.now() + 15000, job.token);
  }
}
