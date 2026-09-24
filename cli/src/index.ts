#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  ChildTransactionReceipt,
  ChildToParentMessageStatus,
  ParentTransactionReceipt,
  ParentToChildMessageStatus,
} from "@arbitrum/sdk";

dotenv.config();

const program = new Command();

const NOVA_RPC = process.env.NOVA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const L1_RPC = process.env.L1_RPC_URL || "https://rpc.sepolia.org";
const ARB_ONE_RPC = process.env.ARB_ONE_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

const NOVA_ENTRY = process.env.NOVA_ENTRY_CONTRACT || ethers.ZeroAddress;
const ETH_ROUTER = process.env.ETH_COMPLETION_ROUTER || ethers.ZeroAddress;

const novaProvider = new ethers.JsonRpcProvider(NOVA_RPC, undefined, { staticNetwork: true });
const l1Provider = new ethers.JsonRpcProvider(L1_RPC, undefined, { staticNetwork: true });
const arbOneProvider = new ethers.JsonRpcProvider(ARB_ONE_RPC, undefined, { staticNetwork: true });

const NovaEntryAbi = [
  "function jobs(bytes32) external view returns (bytes32 jobId, address depositor, address beneficiary, uint256 amount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 messagePosition, uint256 createdAt)",
];

const EthRouterAbi = [
  "function jobs(bytes32) external view returns (uint8 status, address depositor, address beneficiary, uint256 principalAmount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 receivedTimestamp)",
  "function jobBalances(bytes32) external view returns (uint256)",
  "function forwardJob(bytes32 jobId, tuple(uint256 maxSubmissionCost, uint256 gasLimit, uint256 maxFeePerGas) gasParams, uint256 workerReimbursement) external returns (uint256)",
  "function emergencyWithdraw(bytes32 jobId) external",
];

const ROUTER_STATUS_NAMES = ["None", "Received", "Completed", "EmergencyClaimed"];

program
  .name("homeward")
  .description("Homeward Bridge Recovery & Migration Management CLI")
  .version("0.1.0");

// 1. STATUS COMMAND
program
  .command("status <job-id>")
  .description("Inspect migration status across Nova, Ethereum L1, and Arbitrum One")
  .action(async (jobId: string) => {
    const spinner = ora("Querying migration status across chains...").start();

    try {
      const novaContract = new ethers.Contract(NOVA_ENTRY, NovaEntryAbi, novaProvider);
      const l1Contract = new ethers.Contract(ETH_ROUTER, EthRouterAbi, l1Provider);

      let novaJob = null;
      if (NOVA_ENTRY !== ethers.ZeroAddress) {
        try {
          novaJob = await novaContract.jobs(jobId);
        } catch {}
      }

      let l1Job = null;
      let l1Balance = 0n;
      if (ETH_ROUTER !== ethers.ZeroAddress) {
        try {
          l1Job = await l1Contract.jobs(jobId);
          l1Balance = await l1Contract.jobBalances(jobId);
        } catch {}
      }

      spinner.succeed(chalk.green("Migration Status Retrieved:"));

      console.log("\n" + chalk.bold.cyan("=================== HOMEWARD MIGRATION STATUS ==================="));
      console.log(chalk.bold("Job ID:               "), chalk.yellow(jobId));

      if (novaJob && novaJob.depositor !== ethers.ZeroAddress) {
        console.log(chalk.bold.blue("\n--- Arbitrum Nova Layer ---"));
        console.log("Depositor:             ", novaJob.depositor);
        console.log("Beneficiary:           ", novaJob.beneficiary);
        console.log("Principal Amount:      ", ethers.formatEther(novaJob.amount), "ETH");
        console.log("Max Deductions Cap:    ", ethers.formatEther(novaJob.maxDeductions), "ETH");
        console.log("Executor Reward:       ", ethers.formatEther(novaJob.executorReward), "ETH");
        console.log("Min Delivery Target:   ", ethers.formatEther(novaJob.minDeliveryThreshold), "ETH");
        console.log("Message Position:      ", novaJob.messagePosition.toString());
        console.log("Created At:            ", new Date(Number(novaJob.createdAt) * 1000).toLocaleString());
      } else {
        console.log(chalk.gray("\nNova Entry record not found or unconfigured"));
      }

      if (l1Job && l1Job.depositor !== ethers.ZeroAddress) {
        console.log(chalk.bold.magenta("\n--- Ethereum L1 Router Layer ---"));
        const statusIdx = Number(l1Job.status);
        console.log("Router State:          ", chalk.bold(ROUTER_STATUS_NAMES[statusIdx] || "Unknown"));
        console.log("Isolated L1 Balance:   ", ethers.formatEther(l1Balance), "ETH");
        console.log("L1 Received At:        ", new Date(Number(l1Job.receivedTimestamp) * 1000).toLocaleString());

        const emergencyUnlock = Number(l1Job.receivedTimestamp) + 14 * 86400;
        const now = Math.floor(Date.now() / 1000);
        if (now >= emergencyUnlock) {
          console.log(chalk.red.bold("Emergency Withdrawal:   AVAILABLE NOW (Timeout reached)"));
        } else {
          const remainingDays = ((emergencyUnlock - now) / 86400).toFixed(1);
          console.log("Emergency Unlock:      ", `In ~${remainingDays} days (${new Date(emergencyUnlock * 1000).toLocaleDateString()})`);
        }
      } else {
        console.log(chalk.gray("\nL1 Completion Router: Not yet received or unconfigured"));
      }

      console.log(chalk.bold.cyan("=================================================================\n"));
    } catch (err: any) {
      spinner.fail(chalk.red("Failed to fetch migration status: " + err.message));
    }
  });

// 2. CLAIM L1 COMMAND
program
  .command("claim-l1 <job-id>")
  .description("Executes the L1 Outbox claim for a confirmed withdrawal")
  .requiredOption("-t, --nova-tx <txHash>", "Transaction hash of the Nova migration deposit")
  .option("-k, --private-key <key>", "Signer private key for L1 transaction")
  .action(async (jobId: string, options: { novaTx: string; privateKey?: string }) => {
    const key = options.privateKey || process.env.WORKER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!key) {
      console.error(chalk.red("Error: Private key required via -k or PRIVATE_KEY env var"));
      process.exit(1);
    }

    const spinner = ora("Checking Outbox proof and challenge status on Nova...").start();

    try {
      const wallet = new ethers.Wallet(key, l1Provider);
      const receipt = await novaProvider.getTransactionReceipt(options.novaTx);
      if (!receipt) throw new Error("Nova receipt not found");

      const childReceipt = new ChildTransactionReceipt(receipt as any);
      const messages = await childReceipt.getChildToParentMessages(wallet as any);

      if (messages.length === 0) throw new Error("No L2-to-L1 messages found");
      const msg = messages[0];

      const status = await msg.status(l1Provider as any);
      if (status === ChildToParentMessageStatus.UNCONFIRMED) {
        spinner.warn(chalk.yellow("Challenge period is still active. Outbox claim cannot be executed yet."));
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
    } catch (err: any) {
      spinner.fail(chalk.red("Claim failed: " + err.message));
    }
  });

// 3. FORWARD JOB COMMAND
program
  .command("forward <job-id>")
  .description("Manually forward a received job on L1 to Arbitrum One")
  .option("-k, --private-key <key>", "Signer private key")
  .action(async (jobId: string, options: { privateKey?: string }) => {
    const key = options.privateKey || process.env.WORKER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!key) {
      console.error(chalk.red("Error: Private key required via -k or PRIVATE_KEY env var"));
      process.exit(1);
    }

    const spinner = ora("Preparing manual forwardJob transaction...").start();

    try {
      const wallet = new ethers.Wallet(key, l1Provider);
      const router = new ethers.Contract(ETH_ROUTER, EthRouterAbi, wallet);

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
    } catch (err: any) {
      spinner.fail(chalk.red("Forward failed: " + err.message));
    }
  });

// 4. RETRYABLE STATUS COMMAND
program
  .command("retryable-status <ticket-id>")
  .description("Check the redemption status of a retryable ticket on Arbitrum One")
  .requiredOption("-f, --forward-tx <txHash>", "Forwarding transaction hash on L1")
  .action(async (ticketId: string, options: { forwardTx: string }) => {
    const spinner = ora("Querying retryable ticket on Arbitrum One...").start();

    try {
      const receipt = await l1Provider.getTransactionReceipt(options.forwardTx);
      if (!receipt) throw new Error("L1 forward transaction receipt not found");

      const parentReceipt = new ParentTransactionReceipt(receipt as any);
      const messages = await parentReceipt.getParentToChildMessages(arbOneProvider as any);

      if (messages.length === 0) throw new Error("No parent-to-child messages found in tx");
      const msg = messages[0];

      const status = await msg.status();

      spinner.succeed(chalk.green("Retryable Ticket Status:"));
      console.log("Ticket ID:    ", ticketId);
      console.log("State Code:   ", status);
      if (status === ParentToChildMessageStatus.REDEEMED) {
        console.log("Status:       ", chalk.bold.green("REDEEMED (Beneficiary has received ETH on Arbitrum One)"));
      } else {
        console.log("Status:       ", chalk.bold.yellow("IN PROGRESS / PENDING REDEMPTION"));
      }
    } catch (err: any) {
      spinner.fail(chalk.red("Failed to fetch retryable status: " + err.message));
    }
  });

// 5. RETRYABLE REDEEM COMMAND
program
  .command("retryable-redeem <ticket-id>")
  .description("Manually redeem an unredeemed retryable ticket on Arbitrum One")
  .requiredOption("-f, --forward-tx <txHash>", "Forwarding transaction hash on L1")
  .option("-k, --private-key <key>", "Signer private key on Arbitrum One")
  .action(async (ticketId: string, options: { forwardTx: string; privateKey?: string }) => {
    const key = options.privateKey || process.env.WORKER_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!key) {
      console.error(chalk.red("Error: Private key required"));
      process.exit(1);
    }

    const spinner = ora("Fetching retryable message for manual redemption...").start();

    try {
      const wallet = new ethers.Wallet(key, arbOneProvider);
      const receipt = await l1Provider.getTransactionReceipt(options.forwardTx);
      if (!receipt) throw new Error("L1 transaction receipt not found");

      const parentReceipt = new ParentTransactionReceipt(receipt as any);
      const messages = await parentReceipt.getParentToChildMessages(wallet as any);

      if (messages.length === 0) throw new Error("No parent-to-child messages found");
      const msg = messages[0];

      spinner.text = "Redeeming ticket on Arbitrum One...";
      const redeemTx = await (msg as any).redeem();
      await redeemTx.wait();

      spinner.succeed(chalk.green(`Ticket Redeemed! ETH delivered to beneficiary. Tx: ${redeemTx.hash}`));
    } catch (err: any) {
      spinner.fail(chalk.red("Redemption failed: " + err.message));
    }
  });

// 6. EMERGENCY WITHDRAW COMMAND
program
  .command("emergency-withdraw <job-id>")
  .description("Withdraw funds directly on L1 if 14-day timeout has passed")
  .option("-k, --private-key <key>", "Beneficiary or Depositor private key")
  .action(async (jobId: string, options: { privateKey?: string }) => {
    const key = options.privateKey || process.env.PRIVATE_KEY;
    if (!key) {
      console.error(chalk.red("Error: Private key required (must be depositor or beneficiary)"));
      process.exit(1);
    }

    const spinner = ora("Attempting emergency withdrawal from EthCompletionRouter...").start();

    try {
      const wallet = new ethers.Wallet(key, l1Provider);
      const router = new ethers.Contract(ETH_ROUTER, EthRouterAbi, wallet);

      spinner.text = "Submitting emergencyWithdraw transaction...";
      const tx = await router.emergencyWithdraw(jobId);
      await tx.wait();

      spinner.succeed(chalk.green(`Emergency Withdrawal Executed! Funds returned to caller. Tx: ${tx.hash}`));
    } catch (err: any) {
      spinner.fail(chalk.red("Emergency withdrawal failed: " + err.message));
    }
  });

program.parse(process.argv);
