import ora from "ora";
import chalk from "chalk";
import { ethers } from "ethers";
import { getNovaEntryContract, getEthRouterContract } from "../contracts";
import { getConfig } from "../config";
import { printMigrationStatus, NovaJobData, L1JobData } from "../ui/formatters";

export async function handleStatus(jobId: string): Promise<void> {
  const spinner = ora("Querying migration status across chains...").start();

  try {
    const config = getConfig();
    const novaContract = getNovaEntryContract();
    const l1Contract = getEthRouterContract();

    let novaJob: NovaJobData | null = null;
    if (config.novaEntryAddress !== ethers.ZeroAddress) {
      try {
        const rawNova = await novaContract.jobs(jobId);
        novaJob = {
          jobId: rawNova.jobId,
          depositor: rawNova.depositor,
          beneficiary: rawNova.beneficiary,
          amount: rawNova.amount,
          maxDeductions: rawNova.maxDeductions,
          executorReward: rawNova.executorReward,
          minDeliveryThreshold: rawNova.minDeliveryThreshold,
          messagePosition: rawNova.messagePosition,
          createdAt: rawNova.createdAt,
        };
      } catch {
        // Record may not exist yet on Nova
      }
    }

    let l1Job: L1JobData | null = null;
    if (config.ethCompletionRouterAddress !== ethers.ZeroAddress) {
      try {
        const rawL1 = await l1Contract.jobs(jobId);
        const l1Balance = await l1Contract.jobBalances(jobId);
        l1Job = {
          status: Number(rawL1.status),
          depositor: rawL1.depositor,
          beneficiary: rawL1.beneficiary,
          principalAmount: rawL1.principalAmount,
          maxDeductions: rawL1.maxDeductions,
          executorReward: rawL1.executorReward,
          minDeliveryThreshold: rawL1.minDeliveryThreshold,
          receivedTimestamp: rawL1.receivedTimestamp,
          balance: l1Balance,
        };
      } catch {
        // Record may not exist yet on L1
      }
    }

    spinner.succeed(chalk.green("Migration Status Retrieved:"));
    printMigrationStatus(jobId, novaJob, l1Job);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red("Failed to fetch migration status: " + errorMsg));
  }
}
