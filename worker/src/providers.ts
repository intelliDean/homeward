import { ethers } from "ethers";
import { config } from "./config.js";

export const novaProvider = new ethers.JsonRpcProvider(config.NOVA_RPC_URL);
export const l1Provider = new ethers.JsonRpcProvider(config.L1_RPC_URL);
export const arbOneProvider = new ethers.JsonRpcProvider(config.ARB_ONE_RPC_URL);

export const workerL1Wallet = new ethers.Wallet(config.WORKER_PRIVATE_KEY, l1Provider);
export const workerNovaWallet = new ethers.Wallet(config.WORKER_PRIVATE_KEY, novaProvider);
