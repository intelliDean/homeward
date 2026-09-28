import { ethers } from "ethers";
import { config } from "./config.js";

function patchEthersProvider<T extends ethers.JsonRpcProvider>(provider: T): T {
  const origGetNetwork = provider.getNetwork.bind(provider);
  provider.getNetwork = async () => {
    const net = await origGetNetwork();
    return {
      name: net.name,
      chainId: Number(net.chainId),
      ensAddress: net.ensAddress,
      _isNetwork: true,
    } as any;
  };
  (provider as any)._isProvider = true;
  return provider;
}

export const novaProvider = patchEthersProvider(
  new ethers.JsonRpcProvider(config.NOVA_RPC_URL, undefined, { staticNetwork: true })
);
export const l1Provider = patchEthersProvider(
  new ethers.JsonRpcProvider(config.L1_RPC_URL, undefined, { staticNetwork: true })
);
export const arbOneProvider = patchEthersProvider(
  new ethers.JsonRpcProvider(config.ARB_ONE_RPC_URL, undefined, { staticNetwork: true })
);

export const workerL1Wallet = new ethers.Wallet(config.WORKER_PRIVATE_KEY, l1Provider);
(workerL1Wallet as any)._isSigner = true;

export const workerNovaWallet = new ethers.Wallet(config.WORKER_PRIVATE_KEY, novaProvider);
(workerNovaWallet as any)._isSigner = true;
