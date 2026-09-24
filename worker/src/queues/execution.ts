import { Job } from "bullmq";
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

export interface GasCalculationResult {
  gasParams: {
    maxSubmissionCost: bigint;
    gasLimit: bigint;
    maxFeePerGas: bigint;
  };
  retryableGasCost: bigint;
  workerReimbursement: bigint;
  totalDeductions: bigint;
  maxDeductions: bigint;
  isOverBudget: boolean;
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

  // 1. Submit Outbox claim on L1 if not already claimed
  if (!outboxAlreadyClaimed && !record.outboxClaimTxHash) {
    await executeOutboxClaim(record);
  }

  // 2. Forward Job on L1 via EthCompletionRouter
  logger.info({ jobId }, "Preparing to forward job and dispatch retryable ticket to Arbitrum One");

  const calc = await calculateGasAndDeductions(record);

  logger.info({
    jobId,
    totalDeductions: ethers.formatEther(calc.totalDeductions),
    maxDeductions: ethers.formatEther(calc.maxDeductions),
    workerReimbursement: ethers.formatEther(calc.workerReimbursement),
    retryableGasCost: ethers.formatEther(calc.retryableGasCost),
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

    // Delay and retry in 5 minutes
    await job.moveToDelayed(Date.now() + 300000, job.token);
    return;
  }

  const router = new ethers.Contract(
    config.ETH_COMPLETION_ROUTER,
    EthCompletionRouterAbi,
    workerL1Wallet
  );

  const forwardReceipt = await submitForwardTransaction(router, jobId, calc.gasParams, calc.workerReimbursement);
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

  logger.info({ jobId, ticketId, forwardTxHash: forwardReceipt.hash }, "Job successfully forwarded and retryable queued");
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

  const status = await msg.status(l1Provider as any);
  if (status === ChildToParentMessageStatus.CONFIRMED) {
    const claimTx = await (msg as any).execute(l1Provider as any);
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
 * Computes dynamic gas parameters and compares against user's maxDeductions cap.
 */
async function calculateGasAndDeductions(record: MigrationRecord): Promise<GasCalculationResult> {
  const feeData = await l1Provider.getFeeData();
  const l1GasPrice = feeData.gasPrice || ethers.parseUnits("30", "gwei");

  const arbFeeData = await arbOneProvider.getFeeData();
  const arbGasPrice = arbFeeData.gasPrice || ethers.parseUnits("0.1", "gwei");

  const gasLimit = 100_000n; // Standard ETH transfer gas on Arbitrum
  const maxFeePerGas = (arbGasPrice * 120n) / 100n; // 20% buffer
  const maxSubmissionCost = ethers.parseEther("0.0005"); // Base submission cost buffer
  const retryableGasCost = maxSubmissionCost + (gasLimit * maxFeePerGas);

  const estimatedL1GasUnits = 200_000n;
  const workerReimbursement = estimatedL1GasUnits * l1GasPrice;
  const executorReward = BigInt(record.executorReward);
  const maxDeductions = BigInt(record.maxDeductions);

  const totalDeductions = workerReimbursement + executorReward + retryableGasCost;

  return {
    gasParams: {
      maxSubmissionCost,
      gasLimit,
      maxFeePerGas,
    },
    retryableGasCost,
    workerReimbursement,
    totalDeductions,
    maxDeductions,
    isOverBudget: totalDeductions > maxDeductions,
  };
}

/**
 * Submits the forwardJob transaction to EthCompletionRouter on Ethereum L1.
 */
async function submitForwardTransaction(
  router: ethers.Contract,
  jobId: string,
  gasParams: { maxSubmissionCost: bigint; gasLimit: bigint; maxFeePerGas: bigint },
  workerReimbursement: bigint
): Promise<ethers.ContractTransactionReceipt> {
  logger.info({ jobId }, "Submitting forwardJob to EthCompletionRouter");
  const forwardTx = await router.forwardJob(jobId, gasParams, workerReimbursement);

  logger.info({ jobId, txHash: forwardTx.hash }, "forwardJob transaction submitted. Waiting for confirmation");
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
