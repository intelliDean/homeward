import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

async function main() {
  console.log("\n==================================================");
  console.log("🚀 HOMEWARD TESTNET DEPLOYMENT (SEPOLIA)");
  console.log("==================================================\n");

  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey || privateKey === "" || privateKey === "0x...") {
    console.error("❌ Error: PRIVATE_KEY is not set in .env!");
    console.log("👉 Please open .env and paste your testnet private key into PRIVATE_KEY=...");
    process.exit(1);
  }

  const l1Rpc = process.env.L1_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const l2Rpc = process.env.ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

  const l1Provider = new ethers.JsonRpcProvider(l1Rpc, undefined, { staticNetwork: true });
  const l2Provider = new ethers.JsonRpcProvider(l2Rpc, undefined, { staticNetwork: true });

  const l1Wallet = new ethers.Wallet(privateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(privateKey, l2Provider);

  const deployerAddress = l1Wallet.address;
  console.log(`👤 Deployer Address: ${deployerAddress}\n`);

  // Check balances
  console.log("Checking gas balances on both networks...");
  const l1Bal = await l1Provider.getBalance(deployerAddress);
  const l2Bal = await l2Provider.getBalance(deployerAddress);

  console.log(`   Ethereum Sepolia (L1) Balance: ${ethers.formatEther(l1Bal)} ETH`);
  console.log(`   Arbitrum Sepolia (L2) Balance: ${ethers.formatEther(l2Bal)} ETH\n`);

  const minRequired = ethers.parseEther("0.005");
  if (l1Bal < minRequired || l2Bal < minRequired) {
    console.warn("⚠️ Warning: Insufficient testnet gas funds detected!");
    console.log(`Please ensure ${deployerAddress} has at least ~0.005 ETH on both networks:`);
    console.log("   • Sepolia Faucets:          https://sepoliafaucet.com / https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    console.log("   • Arbitrum Sepolia Faucets: https://faucet.quicknode.com/arbitrum/sepolia / https://bridge.arbitrum.io");
    if (l1Bal === 0n || l2Bal === 0n) {
      console.error("\n❌ Cannot proceed with zero balance. Please fund the wallet and re-run.");
      process.exit(1);
    }
  }

  // Load contract artifacts from contracts/out
  const routerArtifactPath = path.resolve(__dirname, "../contracts/out/EthCompletionRouter.sol/EthCompletionRouter.json");
  const entryArtifactPath = path.resolve(__dirname, "../contracts/out/NovaEntryContract.sol/NovaEntryContract.json");

  const routerArtifact = JSON.parse(fs.readFileSync(routerArtifactPath, "utf-8"));
  const entryArtifact = JSON.parse(fs.readFileSync(entryArtifactPath, "utf-8"));

  // Canonical bridge addresses on Sepolia
  const novaOutbox = process.env.NOVA_OUTBOX_ADDRESS || "0x65f07C7D521164a4d5DaC6eB8Fac8DA067A3B78F";
  const arbOneInbox = process.env.ARB_ONE_INBOX_ADDRESS || "0xaAe29B0366299461418F5324a79Afc425BE5ae21";
  const arbSys = "0x0000000000000000000000000000000000000064";

  // 1. Precompute NovaEntryContract address on Arbitrum Sepolia
  const l2Nonce = await l2Provider.getTransactionCount(deployerAddress, "latest");
  const precomputedNovaEntry = ethers.getCreateAddress({
    from: deployerAddress,
    nonce: l2Nonce,
  });

  console.log(`📍 Precomputed NovaEntryContract Address on Arbitrum: ${precomputedNovaEntry}`);

  // 2. Deploy EthCompletionRouter on Ethereum Sepolia
  console.log("\n📦 Step 1: Deploying EthCompletionRouter on Ethereum Sepolia (L1)...");
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

  // 3. Deploy NovaEntryContract on Arbitrum Sepolia
  console.log("\n📦 Step 2: Deploying NovaEntryContract on Arbitrum Sepolia (L2)...");
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

  // 4. Update .env files automatically
  console.log("\n📝 Updating configuration files with deployed addresses...");

  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");
    envContent = envContent.replace(/NOVA_ENTRY_CONTRACT=.*/g, `NOVA_ENTRY_CONTRACT=${entryAddress}`);
    envContent = envContent.replace(/ETH_COMPLETION_ROUTER=.*/g, `ETH_COMPLETION_ROUTER=${routerAddress}`);
    fs.writeFileSync(envPath, envContent);
    console.log("   • Updated root .env");
  }

  const frontendEnvPath = path.resolve(__dirname, "../frontend/.env.local");
  const frontendEnvContent = `NEXT_PUBLIC_NOVA_ENTRY_CONTRACT=${entryAddress}\nNEXT_PUBLIC_ETH_COMPLETION_ROUTER=${routerAddress}\n`;
  fs.writeFileSync(frontendEnvPath, frontendEnvContent);
  console.log("   • Created frontend/.env.local");

  console.log("\n==================================================");
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("==================================================");
  console.log(`• EthCompletionRouter (Ethereum Sepolia): ${routerAddress}`);
  console.log(`  Etherscan: https://sepolia.etherscan.io/address/${routerAddress}`);
  console.log(`• NovaEntryContract (Arbitrum Sepolia):   ${entryAddress}`);
  console.log(`  Arbiscan:  https://sepolia.arbiscan.io/address/${entryAddress}`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("Fatal deployment error:", err);
  process.exit(1);
});
