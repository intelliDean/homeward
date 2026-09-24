import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

export interface CliConfig {
  novaRpcUrl: string;
  l1RpcUrl: string;
  arbOneRpcUrl: string;
  novaEntryAddress: string;
  ethCompletionRouterAddress: string;
  defaultPrivateKey?: string;
}

export function getConfig(): CliConfig {
  return {
    novaRpcUrl: process.env.NOVA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    l1RpcUrl: process.env.L1_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    arbOneRpcUrl: process.env.ARB_ONE_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    novaEntryAddress: process.env.NOVA_ENTRY_CONTRACT || ethers.ZeroAddress,
    ethCompletionRouterAddress: process.env.ETH_COMPLETION_ROUTER || ethers.ZeroAddress,
    defaultPrivateKey: process.env.WORKER_PRIVATE_KEY || process.env.PRIVATE_KEY,
  };
}
