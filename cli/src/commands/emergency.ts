import ora from "ora";
import chalk from "chalk";
import { l1Provider, getSigner } from "../providers";
import { getEthRouterContract } from "../contracts";

export interface EmergencyWithdrawOptions {
  privateKey?: string;
}

export async function handleEmergencyWithdraw(
  jobId: string,
  options: EmergencyWithdrawOptions
): Promise<void> {
  const spinner = ora("Attempting emergency withdrawal from EthCompletionRouter...").start();

  try {
    const wallet = getSigner(
      options.privateKey,
      l1Provider,
      "Emergency withdrawal requires depositor or beneficiary key"
    );
    const router = getEthRouterContract(wallet);

    spinner.text = "Submitting emergencyWithdraw transaction...";
    const tx = await router.emergencyWithdraw(jobId);
    await tx.wait();

    spinner.succeed(
      chalk.green(
        `Emergency Withdrawal Executed! Funds returned to caller. Tx: ${tx.hash}`
      )
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Emergency withdrawal failed: " + errorMsg));
  }
}
