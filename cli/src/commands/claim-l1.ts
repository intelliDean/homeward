import ora from "ora";
import chalk from "chalk";
import {
  ChildTransactionReceipt,
  ChildToParentMessageStatus,
} from "@arbitrum/sdk";
import { novaProvider, l1Provider, getSigner } from "../providers";

export interface ClaimL1Options {
  novaTx: string;
  privateKey?: string;
}

export async function handleClaimL1(jobId: string, options: ClaimL1Options): Promise<void> {
  const spinner = ora("Checking Outbox proof and challenge status on Nova...").start();

  try {
    const wallet = getSigner(options.privateKey, l1Provider, "L1 Outbox claim");
    const receipt = await novaProvider.getTransactionReceipt(options.novaTx);
    if (!receipt) {
      throw new Error(`Nova transaction receipt not found for hash: ${options.novaTx}`);
    }

    const childReceipt = new ChildTransactionReceipt(receipt as any);
    const messages = await childReceipt.getChildToParentMessages(wallet as any);

    if (messages.length === 0) {
      throw new Error("No L2-to-L1 messages found in the specified transaction receipt");
    }

    const msg = messages[0];
    const status = await msg.status(l1Provider as any);

    if (status === ChildToParentMessageStatus.UNCONFIRMED) {
      spinner.warn(
        chalk.yellow("Challenge period is still active. Outbox claim cannot be executed yet.")
      );
      return;
    }

    if (status === ChildToParentMessageStatus.EXECUTED) {
      spinner.info(chalk.blue("Outbox message has already been claimed on L1."));
      return;
    }

    spinner.text = "Submitting executeTransaction to L1 Outbox...";
    const tx = await (msg as any).execute(l1Provider as any);
    spinner.text = `Transaction submitted (${tx.hash}). Waiting for confirmation...`;
    await tx.wait();

    spinner.succeed(chalk.green(`L1 Outbox Claim Successful! Tx: ${tx.hash}`));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Claim failed: " + errorMsg));
  }
}
