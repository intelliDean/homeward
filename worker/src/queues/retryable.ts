import { Job, DelayedError } from "bullmq";
import { ParentTransactionReceipt, ParentToChildMessageStatus } from "@arbitrum/sdk";
import { l1Provider, arbOneProvider } from "../providers.js";
import { db } from "../db/index.js";
import { migrationsTable } from "../db/schema.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";
import { notifyMigrationCompleted } from "../alerts/notifier.js";

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

    await notifyMigrationCompleted({ jobId, ticketId, beneficiary: record.beneficiary })
      .catch((err) => logger.warn({ err: err.message }, "Error sending migration completed alert"));

    await db
      .update(migrationsTable)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(eq(migrationsTable.jobId, jobId));

  } else if (status === ParentToChildMessageStatus.FUNDS_DEPOSITED_ON_CHILD) {
    // Ticket is on L2 but awaiting auto-redemption or manual redeem — poll briefly
    logger.info({ jobId }, "Funds deposited on child, awaiting execution. Retrying in 15 seconds");
    await job.moveToDelayed(Date.now() + 15_000, job.token);
    throw new DelayedError();

  } else if (status === ParentToChildMessageStatus.EXPIRED) {
    // Issue 3: Expired tickets are not retried endlessly. The call data is empty (ETH-only transfer)
    // so expiry is unexpected, but if it occurs the funds are retrievable via manual redeem on Arb One.
    const recoveryMsg =
      `Retryable ticket ${ticketId} has EXPIRED on Arbitrum One. ` +
      `Funds are held by the Arbitrum One Bridge. ` +
      `Recover by calling redeem() via the Arbitrum One portal (https://retryable-dashboard.arbitrum.io) ` +
      `or: npx tsx cli/src/index.ts retryable-redeem ${ticketId} --forward-tx ${record.forwardTxHash}`;

    logger.error({ jobId, ticketId }, recoveryMsg);
    await db
      .update(migrationsTable)
      .set({ status: "FAILED", errorMessage: recoveryMsg, updatedAt: new Date() })
      .where(eq(migrationsTable.jobId, jobId));

  } else if (status === ParentToChildMessageStatus.CREATION_FAILED) {
    const recoveryMsg =
      `Retryable ticket ${ticketId} CREATION FAILED on Arbitrum One. ` +
      `This indicates an Arbitrum One sequencer or inbox issue. ` +
      `Contact the operator and check https://status.arbitrum.io. ` +
      `Job ID: ${jobId}, Forward Tx: ${record.forwardTxHash}`;

    logger.error({ jobId, ticketId }, recoveryMsg);
    await db
      .update(migrationsTable)
      .set({ status: "FAILED", errorMessage: recoveryMsg, updatedAt: new Date() })
      .where(eq(migrationsTable.jobId, jobId));

  } else {
    // NOT_YET_CREATED or other transient state — keep polling
    logger.info({ jobId, status }, "Ticket not yet created or unknown status. Checking again in 15 seconds");
    await job.moveToDelayed(Date.now() + 15_000, job.token);
    throw new DelayedError();
  }
}
