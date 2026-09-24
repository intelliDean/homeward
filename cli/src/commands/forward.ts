import ora from "ora";
import chalk from "chalk";
import { ethers } from "ethers";
import { l1Provider, getSigner } from "../providers";
import { getEthRouterContract } from "../contracts";

export interface ForwardOptions {
  privateKey?: string;
}

export async function handleForward(jobId: string, options: ForwardOptions): Promise<void> {
  const spinner = ora("Preparing manual forwardJob transaction...").start();

  try {
    const wallet = getSigner(options.privateKey, l1Provider, "Forwarding job on L1");
    const router = getEthRouterContract(wallet);

    const gasParams = {
      maxSubmissionCost: ethers.parseEther("0.0005"),
      gasLimit: 100_000n,
      maxFeePerGas: ethers.parseUnits("0.2", "gwei"),
    };

    spinner.text = "Dispatching forwardJob to EthCompletionRouter...";
    const tx = await router.forwardJob(jobId, gasParams, 0n);
    spinner.text = `Transaction broadcasted (${tx.hash}). Awaiting block...`;
    await tx.wait();

    spinner.succeed(chalk.green(`Migration Forwarded Successfully! Tx: ${tx.hash}`));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Forward failed: " + errorMsg));
  }
}
