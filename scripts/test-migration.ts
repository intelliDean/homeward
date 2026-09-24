import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const NovaEntryAbi = [
  "event MigrationJobCreated(bytes32 indexed jobId, uint256 indexed messagePosition, address indexed depositor, address beneficiary, uint256 amount, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold, uint256 timestamp)",
  "function createMigration(address beneficiary, uint256 maxDeductions, uint256 executorReward, uint256 minDeliveryThreshold) external payable returns (bytes32 jobId, uint256 messagePosition)",
];

async function main() {
  console.log("\n==================================================");
  console.log("🚀 INITIATING LIVE TESTNET ETH MIGRATION");
  console.log("==================================================\n");

  const privateKey = process.env.PRIVATE_KEY?.trim();
  const entryAddress = process.env.NOVA_ENTRY_CONTRACT?.trim();
  const rpc = process.env.ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

  if (!privateKey || !entryAddress) {
    console.error("Missing PRIVATE_KEY or NOVA_ENTRY_CONTRACT in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`👤 Sender Wallet:    ${wallet.address}`);
  console.log(`📍 NovaEntryContract: ${entryAddress}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Current Balance:  ${ethers.formatEther(balance)} ETH\n`);

  const depositAmount = ethers.parseEther("0.0035");
  const maxDeductions = ethers.parseEther("0.001");
  const executorReward = ethers.parseEther("0.0002");
  const minDelivery = ethers.parseEther("0.002");

  console.log("📋 Migration Parameters:");
  console.log(`   • Deposit Amount:         ${ethers.formatEther(depositAmount)} ETH`);
  console.log(`   • Beneficiary Address:    ${wallet.address}`);
  console.log(`   • Max Deductions Cap:     ${ethers.formatEther(maxDeductions)} ETH`);
  console.log(`   • Executor Reward:        ${ethers.formatEther(executorReward)} ETH`);
  console.log(`   • Min Delivery Threshold: ${ethers.formatEther(minDelivery)} ETH\n`);

  const contract = new ethers.Contract(entryAddress, NovaEntryAbi, wallet);

  console.log("📡 Broadcasting createMigration transaction to Arbitrum Sepolia...");
  const tx = await contract.createMigration(
    wallet.address,
    maxDeductions,
    executorReward,
    minDelivery,
    { value: depositAmount }
  );

  console.log(`   Transaction Hash: ${tx.hash}`);
  console.log("   Waiting for block confirmation...");

  const receipt = await tx.wait();
  console.log(`   ✅ Confirmed in block #${receipt.blockNumber} (Gas used: ${receipt.gasUsed.toString()})`);

  let jobId = "";
  let messagePosition = "";

  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "MigrationJobCreated") {
        jobId = parsed.args.jobId;
        messagePosition = parsed.args.messagePosition.toString();
        break;
      }
    } catch {}
  }

  console.log("\n==================================================");
  console.log("🎉 MIGRATION JOB CREATED ON-CHAIN!");
  console.log("==================================================");
  console.log(`• Job ID:           ${jobId}`);
  console.log(`• Message Position: #${messagePosition}`);
  console.log(`• Arbiscan Link:    https://sepolia.arbiscan.io/tx/${tx.hash}`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
