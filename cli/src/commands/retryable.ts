import ora from "ora";
import chalk from "chalk";
import {
  ParentTransactionReceipt,
  ParentToChildMessageStatus,
} from "@arbitrum/sdk";
import { l1Provider, arbOneProvider, getSigner } from "../providers";

export interface RetryableStatusOptions {
  forwardTx: string;
}

export interface RetryableRedeemOptions {
  forwardTx: string;
  privateKey?: string;
}

export async function handleRetryableStatus(
  ticketId: string,
  options: RetryableStatusOptions
): Promise<void> {
  const spinner = ora("Querying retryable ticket on Arbitrum One...").start();

  try {
    const msg = await getParentToChildMessage(options.forwardTx, arbOneProvider);
    const status = await msg.status();

    spinner.succeed(chalk.green("Retryable Ticket Status:"));
    console.log("Ticket ID:    ", ticketId);
    console.log("State Code:   ", status);
    if (status === ParentToChildMessageStatus.REDEEMED) {
      console.log("Status:       ", chalk.bold.green("REDEEMED (Beneficiary has received ETH on Arbitrum One)"));
    } else {
      console.log("Status:       ", chalk.bold.yellow("IN PROGRESS / PENDING REDEMPTION"));
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Failed to fetch retryable status: " + errorMsg));
  }
}

export async function handleRetryableRedeem(
  ticketId: string,
  options: RetryableRedeemOptions
): Promise<void> {
  const spinner = ora("Fetching retryable message for manual redemption...").start();

  try {
    const wallet = getSigner(options.privateKey, arbOneProvider, "Redeeming ticket on Arbitrum One");
    const msg = await getParentToChildMessage(options.forwardTx, wallet);

    spinner.text = "Redeeming ticket on Arbitrum One...";
    const redeemTx = await (msg as any).redeem();
    await redeemTx.wait();

    spinner.succeed(
      chalk.green(`Ticket Redeemed! ETH delivered to beneficiary. Tx: ${redeemTx.hash}`)
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Redemption failed: " + errorMsg));
  }
}

/**
 * Helper to extract ParentToChildMessage from an L1 transaction receipt.
 */
async function getParentToChildMessage(forwardTxHash: string, targetRunner: any) {
  const receipt = await l1Provider.getTransactionReceipt(forwardTxHash);
  if (!receipt) {
    throw new Error(`L1 forward transaction receipt not found for hash: ${forwardTxHash}`);
  }

  const parentReceipt = new ParentTransactionReceipt(receipt as any);
  const messages = await parentReceipt.getParentToChildMessages(targetRunner);

  if (messages.length === 0) {
    throw new Error("No parent-to-child messages found in the forward transaction");
  }

  return messages[0];
}
