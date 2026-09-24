import chalk from "chalk";
import { ethers } from "ethers";
import { ROUTER_STATUS_NAMES } from "../contracts";

export interface NovaJobData {
  jobId: string;
  depositor: string;
  beneficiary: string;
  amount: bigint;
  maxDeductions: bigint;
  executorReward: bigint;
  minDeliveryThreshold: bigint;
  messagePosition: bigint;
  createdAt: bigint;
}

export interface L1JobData {
  status: number;
  depositor: string;
  beneficiary: string;
  principalAmount: bigint;
  maxDeductions: bigint;
  executorReward: bigint;
  minDeliveryThreshold: bigint;
  receivedTimestamp: bigint;
  balance: bigint;
}

export function printMigrationStatus(
  jobId: string,
  novaJob: NovaJobData | null,
  l1Job: L1JobData | null
): void {
  console.log("\n" + chalk.bold.cyan("=================== HOMEWARD MIGRATION STATUS ==================="));
  console.log(chalk.bold("Job ID:                "), chalk.yellow(jobId));

  printNovaSection(novaJob);
  printL1Section(l1Job);

  console.log(chalk.bold.cyan("=================================================================\n"));
}

function printNovaSection(novaJob: NovaJobData | null): void {
  if (novaJob && novaJob.depositor !== ethers.ZeroAddress) {
    console.log(chalk.bold.blue("\n--- Arbitrum Nova Layer ---"));
    console.log("Depositor:              ", novaJob.depositor);
    console.log("Beneficiary:            ", novaJob.beneficiary);
    console.log("Principal Amount:       ", ethers.formatEther(novaJob.amount), "ETH");
    console.log("Max Deductions Cap:     ", ethers.formatEther(novaJob.maxDeductions), "ETH");
    console.log("Executor Reward:        ", ethers.formatEther(novaJob.executorReward), "ETH");
    console.log("Min Delivery Target:    ", ethers.formatEther(novaJob.minDeliveryThreshold), "ETH");
    console.log("Message Position:       ", novaJob.messagePosition.toString());
    console.log("Created At:             ", new Date(Number(novaJob.createdAt) * 1000).toLocaleString());
  } else {
    console.log(chalk.gray("\nNova Entry record not found or unconfigured"));
  }
}

function printL1Section(l1Job: L1JobData | null): void {
  if (l1Job && l1Job.depositor !== ethers.ZeroAddress) {
    console.log(chalk.bold.magenta("\n--- Ethereum L1 Router Layer ---"));
    const statusName = ROUTER_STATUS_NAMES[l1Job.status] || "Unknown";
    console.log("Router State:           ", chalk.bold(statusName));
    console.log("Isolated L1 Balance:    ", ethers.formatEther(l1Job.balance), "ETH");
    console.log("L1 Received At:         ", new Date(Number(l1Job.receivedTimestamp) * 1000).toLocaleString());

    const emergencyUnlock = Number(l1Job.receivedTimestamp) + 14 * 86400;
    const now = Math.floor(Date.now() / 1000);
    if (now >= emergencyUnlock) {
      console.log(chalk.red.bold("Emergency Withdrawal:   AVAILABLE NOW (14-day timeout reached)"));
    } else {
      const remainingDays = ((emergencyUnlock - now) / 86400).toFixed(1);
      console.log(
        "Emergency Unlock:       ",
        `In ~${remainingDays} days (${new Date(emergencyUnlock * 1000).toLocaleDateString()})`
      );
    }
  } else {
    console.log(chalk.gray("\nL1 Completion Router: Not yet received or unconfigured"));
  }
}
