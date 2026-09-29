import { Job, DelayedError } from "bullmq";
import { ethers } from "ethers";
import { ChildTransactionReceipt, ChildToParentMessageStatus } from "@arbitrum/sdk";
import { novaProvider, l1Provider, arbOneProvider, workerL1Wallet } from "../providers.js";
import { EthCompletionRouterAbi } from "../abis/index.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { migrationsTable, MigrationRecord } from "../db/schema.js";
import { retryableQueue } from "./queueManager.js";
import { logger } from "../logger.js";
import { eq } from "drizzle-orm";
import { notifyGasSpike, notifyJobForwarded } from "../alerts/notifier.js";

export interface GasCalculationResult {
  gasParams: {
    maxSubmissionCost: bigint;
    gasLimit: bigint;
    maxFeePerGas: bigint;
  };
  retryableGasCost: bigint;
  executorReward: bigint;
  workerReimbursement: bigint; // derived: maxDeductions - executorReward - retryableGasCost
  totalDeductions: bigint;     // always === maxDeductions when not over budget
  maxDeductions: bigint;
  isOverBudget: boolean;       // true when retryableCost alone > maxDeductions - executorReward
}

export async function processExecution(job: Job<{ jobId: string; outboxAlreadyClaimed?: boolean }>) {
  const { jobId, outboxAlreadyClaimed } = job.data;

  const records = await db
    .select()
    .from(migrationsTable)
    .where(eq(migrationsTable.jobId, jobId))
    .limit(1);

  if (records.length === 0) {
    logger.warn({ jobId }, "Job record not found during execution");
    return;
  }

  const record = records[0];

  // Crash recovery: if we already submitted forwardJob before the crash, recover from on-chain events
  if (record.forwardTxHash) {
    logger.info({ jobId, forwardTxHash: record.forwardTxHash }, "Forward tx already on-chain — recovering ticketId from events");
    await recoverForwardedJob(record);
    return;
  }

  // 1. Submit Outbox claim on L1 if not already claimed
  if (!outboxAlreadyClaimed && !record.outboxClaimTxHash) {
    await executeOutboxClaim(record);
  }

  // 2. Forward Job on L1 via EthCompletionRouter
  logger.info({ jobId }, "Preparing to forward job and dispatch retryable ticket to Arbitrum One");

  const calc = await calculateGasAndDeductions(record);

  logger.info({
    jobId,
    retryableGasCost: ethers.formatEther(calc.retryableGasCost),
    maxDeductions: ethers.formatEther(calc.maxDeductions),
    executorReward: ethers.formatEther(calc.executorReward),
  }, "Fee calculation comparison");

  if (calc.isOverBudget) {
    logger.warn({
      jobId,
      totalDeductions: ethers.formatEther(calc.totalDeductions),
      maxDeductions: ethers.formatEther(calc.maxDeductions),
    }, "Gas spike exceeded maxDeductions cap. Re-evaluating later");

    await db
      .update(migrationsTable)
      .set({
        status: "OVER_BUDGET",
        errorMessage: `Gas fee spike (${ethers.formatEther(calc.totalDeductions)} ETH > ${ethers.formatEther(calc.maxDeductions)} ETH cap)`,
        updatedAt: new Date(),
      })
      .where(eq(migrationsTable.jobId, jobId));

    await notifyGasSpike({
      jobId,
      totalRequiredDeductions: ethers.formatEther(calc.totalDeductions),
      maxAllowedDeductions: ethers.formatEther(calc.maxDeductions),
    }).catch((err) => logger.warn({ err: err.message }, "Error sending gas spike alert"));

    // Delay and retry in 5 minutes
    await job.moveToDelayed(Date.now() + 300000, job.token);
    throw new DelayedError();
  }

  const router = new ethers.Contract(
    config.ETH_COMPLETION_ROUTER,
    EthCompletionRouterAbi,
    workerL1Wallet
  );

  const forwardReceipt = await submitForwardTransaction(router, jobId, calc.gasParams);
  const ticketId = extractTicketId(forwardReceipt, router.interface);

  await db
    .update(migrationsTable)
    .set({
      forwardTxHash: forwardReceipt.hash,
      retryableTicketId: ticketId,
      status: "TRACKING_RETRYABLE",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(migrationsTable.jobId, jobId));

  await retryableQueue.add(
    "track-retryable",
    { jobId, ticketId },
    { jobId: `retryable-${jobId}` }
  );

  const netDelivery = ethers.formatEther(
    BigInt(record.principalAmount) - BigInt(record.maxDeductions)
  );
  const workerReward = ethers.formatEther(BigInt(record.maxDeductions));

  await notifyJobForwarded({
    jobId,
    forwardTxHash: forwardReceipt.hash,
    ticketId,
    netDeliveryAmount: netDelivery,
    workerReward,
  }).catch((err) => logger.warn({ err: err.message }, "Error sending job forwarded alert"));

  logger.info({ jobId, ticketId, forwardTxHash: forwardReceipt.hash }, "Job successfully forwarded and retryable queued");
}

/**
 * Issue 3 — Crash recovery: when the worker restarts and finds a forwardTxHash already in the DB,
 * it reads the JobForwarded event from the completed L1 transaction to get the ticketId,
 * then enqueues retryable tracking. Re-forwarding would revert with JobNotReceived.
 */
async function recoverForwardedJob(record: MigrationRecord): Promise<void> {
  const { jobId, forwardTxHash } = record;
  if (!forwardTxHash) return;

  const router = new ethers.Contract(config.ETH_COMPLETION_ROUTER, EthCompletionRouterAbi, workerL1Wallet);
  const receipt = await l1Provider.getTransactionReceipt(forwardTxHash);

  if (!receipt) {
    // Transaction still pending — do not re-forward; throw to retry later
    throw new Error(`Forward tx ${forwardTxHash} not yet mined. Will retry.`);
  }

  const ticketId = extractTicketId(receipt as ethers.ContractTransactionReceipt, router.interface);

  if (ticketId) {
    await db
      .update(migrationsTable)
      .set({ retryableTicketId: ticketId, status: "TRACKING_RETRYABLE", errorMessage: null, updatedAt: new Date() })
      .where(eq(migrationsTable.jobId, jobId));

    await retryableQueue.add("track-retryable", { jobId, ticketId }, { jobId: `retryable-${jobId}` });
    logger.info({ jobId, ticketId }, "Crash recovery: ticketId recovered from on-chain events, retryable enqueued");
  } else {
    logger.warn({ jobId, forwardTxHash }, "Crash recovery: forward tx mined but no JobForwarded event found. Check contract logs.");
    await db
      .update(migrationsTable)
      .set({ status: "TRACKING_RETRYABLE", errorMessage: "Recovered post-crash: ticketId not found in logs", updatedAt: new Date() })
      .where(eq(migrationsTable.jobId, jobId));
  }
}

/**
 * Executes the L1 Outbox claim for a confirmed Nova migration withdrawal.
 */
async function executeOutboxClaim(record: MigrationRecord): Promise<void> {
  logger.info({ jobId: record.jobId }, "Executing L1 Outbox claim");

  const receipt = await novaProvider.getTransactionReceipt(record.novaTxHash);
  if (!receipt) throw new Error(`Nova receipt not found for ${record.novaTxHash}`);

  const childReceipt = new ChildTransactionReceipt(receipt as any);
  const messages = await childReceipt.getChildToParentMessages(workerL1Wallet as any);

  if (messages.length === 0) throw new Error("No L2-to-L1 messages found");
  const msg = messages[0];

  const status = await msg.status(novaProvider as any);
  if (status === ChildToParentMessageStatus.CONFIRMED) {
    const claimTx = await (msg as any).execute(novaProvider as any);
    logger.info({ jobId: record.jobId, claimTxHash: claimTx.hash }, "Outbox claim transaction submitted. Waiting for confirmation");
    const claimReceipt = await claimTx.wait();

    await db
      .update(migrationsTable)
      .set({
        outboxClaimTxHash: claimReceipt?.hash || claimTx.hash,
        status: "CLAIMING_OUTBOX",
        updatedAt: new Date(),
      })
      .where(eq(migrationsTable.jobId, record.jobId));
  }
}

/**
 * Computes dynamic retryable gas parameters and checks whether the retryable cost
 * fits within the user's cap (after reserving the executor reward).
 * Worker reimbursement is now derived by the contract, but we compute it here for
 * logging purposes: maxDeductions - executorReward - retryableGasCost.
 */
async function calculateGasAndDeductions(record: MigrationRecord): Promise<GasCalculationResult> {
  const arbFeeData = await arbOneProvider.getFeeData();
  const arbGasPrice = arbFeeData.gasPrice || ethers.parseUnits("0.1", "gwei");

  const gasLimit = 100_000n;
  const maxFeePerGas = (arbGasPrice * 120n) / 100n; // 20% buffer
  const maxSubmissionCost = ethers.parseEther("0.0005");
  const retryableGasCost = maxSubmissionCost + (gasLimit * maxFeePerGas);

  const executorReward = BigInt(record.executorReward);
  const maxDeductions = BigInt(record.maxDeductions);

  // isOverBudget when retryable cost alone exceeds the remaining cap after executor reward
  const isOverBudget = retryableGasCost + executorReward > maxDeductions;
  const workerReimbursement = isOverBudget ? 0n : maxDeductions - executorReward - retryableGasCost;
  const totalDeductions = maxDeductions; // contract always deducts exactly maxDeductions

  return {
    gasParams: { maxSubmissionCost, gasLimit, maxFeePerGas },
    retryableGasCost,
    executorReward,
    workerReimbursement,
    totalDeductions,
    maxDeductions,
    isOverBudget,
  };
}

/**
 * Submits the forwardJob transaction to EthCompletionRouter on Ethereum L1.
 * workerReimbursement is no longer a parameter — the contract derives it from the cap.
 */
async function submitForwardTransaction(
  router: ethers.Contract,
  jobId: string,
  gasParams: { maxSubmissionCost: bigint; gasLimit: bigint; maxFeePerGas: bigint }
): Promise<ethers.ContractTransactionReceipt> {
  logger.info({ jobId }, "Submitting forwardJob to EthCompletionRouter");
  const forwardTx = await router.forwardJob(jobId, gasParams);
  logger.info({ jobId, txHash: forwardTx.hash }, "forwardJob submitted. Waiting for confirmation");
  return await forwardTx.wait();
}

/**
 * Extracts retryable ticketId from receipt logs.
 */
function extractTicketId(receipt: ethers.ContractTransactionReceipt, routerInterface: ethers.Interface): string {
  for (const log of receipt.logs) {
    try {
      const parsed = routerInterface.parseLog(log);
      if (parsed && parsed.name === "JobForwarded") {
        return parsed.args.ticketId.toString();
      }
    } catch {}
  }
  return "";
}
