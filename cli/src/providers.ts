import { ethers } from "ethers";
import { getConfig } from "./config";

const config = getConfig();

export const novaProvider = new ethers.JsonRpcProvider(config.novaRpcUrl, undefined, {
  staticNetwork: true,
});

export const l1Provider = new ethers.JsonRpcProvider(config.l1RpcUrl, undefined, {
  staticNetwork: true,
});

export const arbOneProvider = new ethers.JsonRpcProvider(config.arbOneRpcUrl, undefined, {
  staticNetwork: true,
});

/**
 * Resolves a signer wallet for the specified provider.
 * Throws a descriptive error if private key is not provided via flag or env.
 */
export function getSigner(
  explicitKey: string | undefined,
  provider: ethers.Provider,
  contextMessage = "Transaction requires a private key"
): ethers.Wallet {
  const privateKey = explicitKey || config.defaultPrivateKey;
  if (!privateKey) {
    throw new Error(
      `${contextMessage}. Provide --private-key <key> or set PRIVATE_KEY in your environment.`
    );
  }
  return new ethers.Wallet(privateKey, provider);
}
