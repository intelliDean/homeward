import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumNova, arbitrumSepolia, sepolia, mainnet, arbitrum } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Homeward",
  projectId: "3a8170812b534d0ff9d794f19a901d64", // Standard public WalletConnect demo ID
  chains: [arbitrumNova, arbitrumSepolia, sepolia, mainnet, arbitrum],
  transports: {
    [arbitrumNova.id]: http("https://nova.arbitrum.io/rpc"),
    [arbitrumSepolia.id]: http("https://sepolia-rollup.arbitrum.io/rpc"),
    [sepolia.id]: http("https://rpc.sepolia.org"),
    [mainnet.id]: http("https://eth.llamarpc.com"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
  },
  ssr: true,
});
