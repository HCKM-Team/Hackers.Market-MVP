# HCKM Multi-Chain Deployment Guide

## Overview

This guide explains how to deploy the HCKM (Hackers.Market) smart contracts to multiple test networks using CREATE3 for deterministic addresses.

## Supported Networks

- **Ethereum Sepolia** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)  
- **Etherlink Testnet** (Chain ID: 128123)

## Prerequisites

1. **Node.js & npm** installed
2. **Private key** with testnet ETH on all target networks
3. **RPC URLs** for each network (optional - defaults provided)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Optional - RPC URLs (defaults provided)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHERLINK_TESTNET_RPC_URL=https://node.ghostnet.etherlink.com

# Optional - Block Explorer API Keys for verification
ETHERSCAN_API_KEY=your_etherscan_api_key
BASESCAN_API_KEY=your_basescan_api_key

# Optional - Configuration
SECURITY_TEAM_ADDRESS=0x... # Defaults to deployer
CREATION_FEE=1000000000000000  # 0.001 ETH in wei
```

### 3. Fund Your Deployer Address

Ensure your deployer address has testnet ETH on all target networks:

- **Ethereum Sepolia**: [Sepolia Faucet](https://sepoliafaucet.com/)
- **Base Sepolia**: [Base Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- **Etherlink**: [Etherlink Faucet](https://faucet.etherlink.com/)

Recommended minimum: 0.1 ETH per network

## Deployment

### Option 1: Deploy to All Networks

Deploy to all configured networks in sequence:

```bash
./scripts/deploy_multichain.sh
```

### Option 2: Deploy to Single Network

Deploy to a specific network:

```bash
# Deploy to Ethereum Sepolia
./scripts/deploy_single.sh sepolia

# Deploy to Base Sepolia
./scripts/deploy_single.sh baseSepolia

# Deploy to Etherlink Testnet
./scripts/deploy_single.sh etherlinkTestnet
```

### Option 3: Manual Step-by-Step

For more control, run each step manually:

```bash
# Step 1: Deploy CREATE3 factory
npx hardhat run scripts/01_deploy_create3.ts --network sepolia

# Step 2: Deploy main contracts
npx hardhat run scripts/02_deploy_contracts.ts --network sepolia

# Step 3: Verify deployment
npx hardhat run scripts/03_verify_deployment.ts --network sepolia

# Step 4: Check cross-chain consistency
npx hardhat run scripts/04_verify_crosschain.ts
```

## Deployment Process

The deployment consists of several phases:

### Phase 1: CREATE3 Factory
- Deploys the CREATE3 factory contract for deterministic addresses

### Phase 2: Core Implementation
- Deploys `EscrowImplementation` using CREATE3 (same address on all chains)

### Phase 3: Modules
- Deploys upgradeable modules:
  - `TimeLockModule` - Time-lock duration calculations
  - `EmergencyModule` - Panic button functionality
  - `DisputeResolver` - Dispute resolution system
  - `ReputationOracle` - Cross-platform reputation

### Phase 4: Factory
- Deploys `EscrowFactory` using CREATE3 (same address on all chains)
- Initializes with implementation and configuration

### Phase 5: Configuration
- Links modules to factory
- Sets up authorization for cross-contract calls
- Configures security contacts

## Verification

After deployment, the scripts automatically verify:

1. **Contract deployment** - All contracts have code
2. **Configuration** - Factory settings are correct
3. **Module integration** - Modules are properly linked
4. **Authorization** - Cross-contract permissions are set
5. **Functionality** - Basic escrow creation works

## Cross-Chain Verification

To verify deterministic addresses across chains:

```bash
npx hardhat run scripts/04_verify_crosschain.ts
```

This checks that:
- `EscrowImplementation` has the same address on all chains
- `EscrowFactory` has the same address on all chains
- Configuration is consistent

## Deployment Outputs

Deployment information is saved to `deployments/<network>.json`:

```json
{
  "network": "sepolia",
  "chainId": 11155111,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "blockNumber": 12345678,
  "deployer": "0x...",
  "contracts": {
    "CREATE3Deployer": "0x...",
    "EscrowImplementation": "0x... (same on all chains)",
    "EscrowFactory": "0x... (same on all chains)",
    "TimeLockModule": "0x...",
    "EmergencyModule": "0x...",
    "DisputeResolver": "0x...",
    "ReputationOracle": "0x..."
  },
  "configuration": {
    "creationFee": "1000000000000000",
    "salt": "HCKM_V1_2024",
    "securityContact": "0x..."
  }
}
```

## Gas Costs (Estimated)

| Operation | Gas | Cost (@ 30 Gwei) |
|-----------|-----|------------------|
| CREATE3 Factory | ~500k | ~0.015 ETH |
| EscrowImplementation | ~3.3M | ~0.099 ETH |
| Each Module | ~2-3M | ~0.06-0.09 ETH |
| EscrowFactory | ~3M | ~0.09 ETH |
| **Total per chain** | ~15M | ~0.45 ETH |

## Troubleshooting

### "Insufficient funds"
- Ensure deployer has enough ETH on the target network
- Check gas price settings in `hardhat.config.ts`

### "Nonce too high"
- Reset nonce in your wallet or wait for pending transactions

### "CREATE3Deployer not found"
- Run `01_deploy_create3.ts` first

### "Module not authorized"
- Check authorization was set correctly in Phase 5
- Manually authorize using `setAuthorizedCaller()`

## Post-Deployment

After successful deployment:

1. **Save deployment files** - Back up `deployments/` directory
2. **Verify on explorers** - Use Etherscan/Basescan verification
3. **Test functionality** - Run integration tests on testnet
4. **Update frontend** - Configure with new contract addresses
5. **Monitor contracts** - Set up monitoring for events

## Security Considerations

- **Private Key**: Never commit `.env` file or expose private keys
- **Ownership**: Transfer ownership to multisig after deployment
- **Modules**: Can be upgraded - ensure proper access control
- **Security Contacts**: Add multiple security team members

## Contact & Support

For deployment issues or questions:
- GitHub: [HCKM-MVP Repository](https://github.com/HCKM-Team/Hackers.Market-MVP-for-unite-defi)
- Documentation: [HCKM Docs (in development)](https://docs.hackers.market)

## License

MIT