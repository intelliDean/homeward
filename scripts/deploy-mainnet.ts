import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { ethers } from "ethers";

// Load .env.production if it exists, otherwise fallback to .env
const prodEnvPath = path.resolve(__dirname, "../.env.production");
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath });
} else {
  dotenv.config();
}

async function main() {
  console.log("\n==================================================");
  console.log("💎 HOMEWARD PRODUCTION MAINNET DEPLOYMENT");
  console.log("==================================================\n");

  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey || privateKey === "" || privateKey === "0x...") {
    console.error("❌ Error: PRIVATE_KEY is not set in environment or .env.production!");
    console.log("👉 Please specify your production deployer private key.");
    process.exit(1);
  }

  const l1Rpc = process.env.L1_RPC_URL || "https://eth.llamarpc.com";
  const novaRpc = process.env.NOVA_RPC_URL || "https://nova.arbitrum.io/rpc";

  console.log("Connecting to RPC endpoints:");
  console.log(`   • Ethereum Mainnet (L1): ${l1Rpc}`);
  console.log(`   • Arbitrum Nova (L2):    ${novaRpc}\n`);

  const l1Provider = new ethers.JsonRpcProvider(l1Rpc, undefined, { staticNetwork: true });
  const l2Provider = new ethers.JsonRpcProvider(novaRpc, undefined, { staticNetwork: true });

  const l1Network = await l1Provider.getNetwork();
  const l2Network = await l2Provider.getNetwork();

  // Strict safety check: Ensure we are targeting Ethereum Mainnet (1) and Arbitrum Nova (42170)
  if (l1Network.chainId !== 1n) {
    console.error(`❌ Safety Reversion: L1 chain ID is ${l1Network.chainId}, expected 1 (Ethereum Mainnet)!`);
    process.exit(1);
  }
  if (l2Network.chainId !== 42170n) {
    console.error(`❌ Safety Reversion: L2 chain ID is ${l2Network.chainId}, expected 42170 (Arbitrum Nova)!`);
    process.exit(1);
  }

  const l1Wallet = new ethers.Wallet(privateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(privateKey, l2Provider);
  const deployerAddress = l1Wallet.address;

  console.log(`👤 Deployer Address: ${deployerAddress}\n`);

  // Check balances
  console.log("Checking deployer balances on Mainnet and Arbitrum Nova...");
  const l1Bal = await l1Provider.getBalance(deployerAddress);
  const l2Bal = await l2Provider.getBalance(deployerAddress);

  console.log(`   Ethereum Mainnet (L1) Balance: ${ethers.formatEther(l1Bal)} ETH`);
  console.log(`   Arbitrum Nova (L2) Balance:    ${ethers.formatEther(l2Bal)} ETH\n`);

  if (l1Bal === 0n || l2Bal === 0n) {
    console.error("❌ Cannot proceed with zero balance. Please fund the deployer wallet on both chains.");
    process.exit(1);
  }

  // Contract artifacts
  const routerArtifactPath = path.resolve(__dirname, "../contracts/out/EthCompletionRouter.sol/EthCompletionRouter.json");
  const entryArtifactPath = path.resolve(__dirname, "../contracts/out/NovaEntryContract.sol/NovaEntryContract.json");

  if (!fs.existsSync(routerArtifactPath) || !fs.existsSync(entryArtifactPath)) {
    console.error("❌ Contract artifacts not found. Please run 'forge build --root contracts' first.");
    process.exit(1);
  }

  const routerArtifact = JSON.parse(fs.readFileSync(routerArtifactPath, "utf-8"));
  const entryArtifact = JSON.parse(fs.readFileSync(entryArtifactPath, "utf-8"));

  // Canonical Mainnet Bridge Addresses
  const novaOutbox = process.env.NOVA_OUTBOX_ADDRESS || "0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58";
  const arbOneInbox = process.env.ARB_ONE_INBOX_ADDRESS || "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f";
  const arbSys = process.env.ARB_SYS_ADDRESS || "0x0000000000000000000000000000000000000064";

  console.log("Canonical Bridge Addresses:");
  console.log(`   • Nova Outbox (Ethereum L1):  ${novaOutbox}`);
  console.log(`   • Arb One Inbox (Ethereum L1): ${arbOneInbox}`);
  console.log(`   • ArbSys Precompile (Nova):   ${arbSys}\n`);

  // Step 1: Precompute NovaEntryContract address on Arbitrum Nova
  const l2Nonce = await l2Provider.getTransactionCount(deployerAddress, "latest");
  const precomputedNovaEntry = ethers.getCreateAddress({
    from: deployerAddress,
    nonce: l2Nonce,
  });

  console.log(`📍 Precomputed NovaEntryContract Address on Nova: ${precomputedNovaEntry}`);

  // Step 2: Deploy EthCompletionRouter on Ethereum Mainnet (L1)
  console.log("\n📦 Step 1: Deploying EthCompletionRouter on Ethereum Mainnet (L1)...");
  const routerFactory = new ethers.ContractFactory(
    routerArtifact.abi,
    routerArtifact.bytecode.object,
    l1Wallet
  );

  const routerContract = await routerFactory.deploy(
    novaOutbox,
    precomputedNovaEntry,
    arbOneInbox
  );
  console.log(`   Transaction broadcasted: ${routerContract.deploymentTransaction()?.hash}`);
  await routerContract.waitForDeployment();
  const routerAddress = await routerContract.getAddress();
  console.log(`   ✅ EthCompletionRouter deployed at: ${routerAddress}`);

  // Step 3: Deploy NovaEntryContract on Arbitrum Nova (L2)
  console.log("\n📦 Step 2: Deploying NovaEntryContract on Arbitrum Nova (L2)...");
  const entryFactory = new ethers.ContractFactory(
    entryArtifact.abi,
    entryArtifact.bytecode.object,
    l2Wallet
  );

  const entryContract = await entryFactory.deploy(
    routerAddress,
    arbSys
  );
  console.log(`   Transaction broadcasted: ${entryContract.deploymentTransaction()?.hash}`);
  await entryContract.waitForDeployment();
  const entryAddress = await entryContract.getAddress();
  console.log(`   ✅ NovaEntryContract deployed at: ${entryAddress}`);

  if (entryAddress.toLowerCase() !== precomputedNovaEntry.toLowerCase()) {
    console.error(`❌ Address mismatch: expected ${precomputedNovaEntry}, got ${entryAddress}`);
    process.exit(1);
  }

  // Step 4: Write out deployed addresses
  console.log("\n📝 Saving deployed addresses to production configuration...");
  const targetEnv = fs.existsSync(prodEnvPath) ? prodEnvPath : path.resolve(__dirname, "../.env");
  let content = fs.readFileSync(targetEnv, "utf-8");
  content = content.replace(/NOVA_ENTRY_CONTRACT=.*/g, `NOVA_ENTRY_CONTRACT=${entryAddress}`);
  content = content.replace(/ETH_COMPLETION_ROUTER=.*/g, `ETH_COMPLETION_ROUTER=${routerAddress}`);
  fs.writeFileSync(targetEnv, content);

  console.log("\n==================================================");
  console.log("🎉 MAINNET DEPLOYMENT SUCCESSFUL!");
  console.log("==================================================");
  console.log(`• EthCompletionRouter (Ethereum Mainnet): ${routerAddress}`);
  console.log(`  Etherscan: https://etherscan.io/address/${routerAddress}`);
  console.log(`• NovaEntryContract (Arbitrum Nova):       ${entryAddress}`);
  console.log(`  Nova Arbiscan: https://nova.arbiscan.io/address/${entryAddress}`);
  console.log("==================================================\n");

  console.log("To verify the contracts, run:");
  console.log(`forge verify-contract --root contracts --chain 1 ${routerAddress} src/EthCompletionRouter.sol:EthCompletionRouter --watch`);
  console.log(`forge verify-contract --root contracts --chain 42170 ${entryAddress} src/NovaEntryContract.sol:NovaEntryContract --watch\n`);
}

main().catch((err) => {
  console.error("Fatal deployment error:", err);
  process.exit(1);
});
