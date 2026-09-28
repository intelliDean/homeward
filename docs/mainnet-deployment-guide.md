# Homeward — Mainnet Deployment & Production Configuration Guide

This guide details the procedures for deploying the Homeward protocol to **Ethereum Mainnet** (L1 settlement) and **Arbitrum Nova** (L2 source chain), and configuring the background worker daemon for production operation.

---

## 1. Architecture & Canonical Mainnet Routing

Homeward executes a trustless 3-leg migration flow:
```
Arbitrum Nova (Chain ID 42170)
   └─ NovaEntryContract locks ETH & calls ArbSys.sendTxToL1(completionRouter, payload)
        │
        ▼ (6.4 - 7 day canonical fraud-proof challenge window)
Ethereum Mainnet (Chain ID 1)
   └─ Canonical Nova Outbox executes transaction
   └─ EthCompletionRouter receives ETH, reimburses gas-advancing worker,
      and dispatches retryable ticket to Arbitrum One Inbox
        │
        ▼
Arbitrum One (Chain ID 42161)
   └─ Canonical retryable ticket delivers net ETH directly to Beneficiary
```

### Canonical Mainnet Addresses

| Contract | Network | Address | Description |
| :--- | :--- | :--- | :--- |
| **`ArbSys` Precompile** | Arbitrum Nova (`42170`) | `0x0000000000000000000000000000000000000064` | Universal Arbitrum system precompile |
| **`Nova Outbox`** | Ethereum Mainnet (`1`) | `0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58` | Official canonical Nova Outbox on Ethereum L1 |
| **`Arb One Inbox`** | Ethereum Mainnet (`1`) | `0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f` | Official canonical Arbitrum One Inbox on Ethereum L1 |

---

## 2. Production Prerequisites

1. **Deployer Wallet (EOA)**:
   - Must have ETH on **Ethereum Mainnet** (~0.015 - 0.03 ETH for contract deployment gas).
   - Must have ETH on **Arbitrum Nova** (~0.002 ETH for contract deployment gas).
2. **Worker Wallet (EOA)**:
   - Dedicated key for the worker process.
   - Recommended initial balance: ~0.05 - 0.1 ETH on Ethereum Mainnet to advance L1 Outbox claim gas and retryable creation costs (which are reimbursed automatically upon execution).
3. **RPC Endpoints**:
   - High-availability Ethereum Mainnet RPC (e.g. Alchemy, Infura, QuickNode).
   - Arbitrum Nova RPC (`https://nova.arbitrum.io/rpc`).
   - Arbitrum One RPC (`https://arb1.arbitrum.io/rpc`).
4. **PostgreSQL & Redis**:
   - Managed PostgreSQL instance with connection pooling.
   - Redis 6+ cluster or standalone instance for BullMQ queues.

---

## 3. Production Environment Setup

Copy `.env.production.example` to `.env.production`:

```bash
cp .env.production.example .env.production
```

Configure the environment variables in `.env.production`:

```env
# 1. Wallets
PRIVATE_KEY=0x<DEPLOYER_PRIVATE_KEY>
WORKER_PRIVATE_KEY=0x<WORKER_PRIVATE_KEY>

# 2. Canonical Mainnet RPCs
NOVA_RPC_URL=https://nova.arbitrum.io/rpc
L1_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<API_KEY>
ARB_ONE_RPC_URL=https://arb1.arbitrum.io/rpc

# 3. Canonical Mainnet Bridge Contracts
NOVA_OUTBOX_ADDRESS=0xD4B80C3D7240325D18E645B49e6535A3Bf95cc58
ARB_ONE_INBOX_ADDRESS=0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f
ARB_SYS_ADDRESS=0x0000000000000000000000000000000000000064

# 4. Database & Cache
DATABASE_URL=postgres://homeward:secure_pass@db:5432/homeward_production
REDIS_URL=redis://redis:6379

# 5. Worker Gas Policy
MAX_ALLOWED_L1_GAS_GWEI=40
DISCOVERY_POLL_INTERVAL_MS=15000
MONITORING_POLL_INTERVAL_MS=60000

# 6. Block Explorer Verification
ETHERSCAN_API_KEY=<YOUR_ETHERSCAN_KEY>
ARBISCAN_API_KEY=<YOUR_ARBISCAN_KEY>
NOVA_ARBISCAN_API_KEY=<YOUR_ARBISCAN_KEY>
```

---

## 4. Contract Deployment

Run the automated mainnet deployment script:

```bash
npm run deploy:mainnet
```

### Deployment Mechanism
1. **Safety Assertions**: The script queries connected providers and enforces `l1Network.chainId === 1n` and `l2Network.chainId === 42170n`.
2. **Circular Dependency Resolution**: Precomputes `NovaEntryContract` address on Nova from `deployerAddress` + `nonce`.
3. **L1 Deployment**: Deploys `EthCompletionRouter` on Ethereum Mainnet passing `NOVA_OUTBOX_ADDRESS`, `precomputedNovaEntry`, and `ARB_ONE_INBOX_ADDRESS`.
4. **L2 Deployment**: Deploys `NovaEntryContract` on Arbitrum Nova passing `routerAddress` and `ARB_SYS_ADDRESS`.
5. **State Synchronization**: Automatically writes the deployed addresses into `.env.production`.

---

## 5. Block Explorer Source Verification

Run Foundry verification with the preconfigured profiles:

### Verify EthCompletionRouter (Ethereum Mainnet)
```bash
forge verify-contract \
  --root contracts \
  --chain 1 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  $ETH_COMPLETION_ROUTER \
  src/EthCompletionRouter.sol:EthCompletionRouter \
  --watch
```

### Verify NovaEntryContract (Arbitrum Nova)
```bash
forge verify-contract \
  --root contracts \
  --chain 42170 \
  --etherscan-api-key $ARBISCAN_API_KEY \
  --verifier-url https://api-nova.arbiscan.io/api \
  $NOVA_ENTRY_CONTRACT \
  src/NovaEntryContract.sol:NovaEntryContract \
  --watch
```

---

## 6. Running the Production Worker

Once contracts are deployed and `.env.production` is populated:

```bash
# Build and start worker in production mode
cd worker
npm run build
NODE_ENV=production npm start
```

Or via Docker (recommended):

```bash
docker compose -f docker-compose.prod.yml up -d
```
