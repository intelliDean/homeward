import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Database & Redis
  DATABASE_URL: z.string().default("postgres://postgres@localhost:5432/homeward"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),

  // RPCs
  NOVA_RPC_URL: z.string().default("https://sepolia-rollup.arbitrum.io/rpc"), // Defaults to Arb Sepolia for testnet
  L1_RPC_URL: z.string().default("https://rpc.sepolia.org"),
  ARB_ONE_RPC_URL: z.string().default("https://sepolia-rollup.arbitrum.io/rpc"),

  // Contract Addresses
  NOVA_ENTRY_CONTRACT: z.string().default("0x0000000000000000000000000000000000000000"),
  ETH_COMPLETION_ROUTER: z.string().default("0x0000000000000000000000000000000000000000"),
  NOVA_OUTBOX_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  ARB_ONE_INBOX_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),

  // Worker Wallet
  WORKER_PRIVATE_KEY: z.string().default("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), // Default Anvil key 0

  // Polling Intervals & Constraints
  DISCOVERY_POLL_INTERVAL_MS: z.coerce.number().default(15000),
  MONITORING_POLL_INTERVAL_MS: z.coerce.number().default(30000),
  MAX_ALLOWED_L1_GAS_GWEI: z.coerce.number().default(50),
});

export const config = envSchema.parse(process.env);
