#!/usr/bin/env node
import { Command } from "commander";
import { handleStatus } from "./commands/status";
import { handleClaimL1 } from "./commands/claim-l1";
import { handleForward } from "./commands/forward";
import { handleRetryableStatus, handleRetryableRedeem } from "./commands/retryable";
import { handleEmergencyWithdraw } from "./commands/emergency";

const program = new Command();

program
  .name("homeward")
  .description("Homeward Bridge Recovery & Migration Management CLI")
  .version("0.1.0");

// 1. Status inspection command
program
  .command("status <job-id>")
  .description("Inspect migration status across Nova, Ethereum L1, and Arbitrum One")
  .action(handleStatus);

// 2. L1 Outbox claim command
program
  .command("claim-l1 <job-id>")
  .description("Executes the L1 Outbox claim for a confirmed withdrawal")
  .requiredOption("-t, --nova-tx <txHash>", "Transaction hash of the Nova migration deposit")
  .option("-k, --private-key <key>", "Signer private key for L1 transaction")
  .action(handleClaimL1);

// 3. Manual forward job command
program
  .command("forward <job-id>")
  .description("Manually forward a received job on L1 to Arbitrum One")
  .option("-k, --private-key <key>", "Signer private key")
  .action(handleForward);

// 4. Retryable status command
program
  .command("retryable-status <ticket-id>")
  .description("Check the redemption status of a retryable ticket on Arbitrum One")
  .requiredOption("-f, --forward-tx <txHash>", "Forwarding transaction hash on L1")
  .action(handleRetryableStatus);

// 5. Manual retryable redeem command
program
  .command("retryable-redeem <ticket-id>")
  .description("Manually redeem an unredeemed retryable ticket on Arbitrum One")
  .requiredOption("-f, --forward-tx <txHash>", "Forwarding transaction hash on L1")
  .option("-k, --private-key <key>", "Signer private key on Arbitrum One")
  .action(handleRetryableRedeem);

// 6. Emergency 14-day recovery command
program
  .command("emergency-withdraw <job-id>")
  .description("Withdraw funds directly on L1 if 14-day timeout has passed")
  .option("-k, --private-key <key>", "Beneficiary or Depositor private key")
  .action(handleEmergencyWithdraw);

program.parse(process.argv);
