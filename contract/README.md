# HCKM (Hackers.Market) Smart Contracts

Revolutionary Anti-Coercion P2P Escrow Protocol for Physical Safety in Decentralized Trading

## 1. 🚀 Overview

HCKM (Hackers.Market) implements the world's first anti-coercion P2P escrow protocol, addressing a critical vulnerability in peer-to-peer trading: **physical coercion attacks**. Our smart contract system protects users from being forced to release escrowed funds prematurely through innovative time-lock mechanisms and emergency intervention systems.

### 1.1 Key Innovation: Anti-Coercion Protocol

Traditional P2P trading platforms fail when attackers gain physical control over victims. HCKM solves this through:

- **⏰ Time-Locked Fund Release**: Mandatory waiting periods prevent immediate access
- **🚨 Emergency Stop Mechanisms**: Panic code system for duress situations  
- **⚖️ Automated Dispute Resolution**: Multi-tier arbitration system
- **🏆 Reputation-Based Trust**: Cross-platform reputation scoring

## 2. 🏗️ Architecture

### 2.1 Modular Upgradeable Design

All contracts implement OpenZeppelin's UUPS (Universal Upgradeable Proxy Standard) with a modular architecture:

```
                    ┌─────────────────┐
                    │  EscrowFactory  │
                    │   (Upgradeable) │
                    └────────┬────────┘
                             │ deploys & manages
                             ▼
                    ┌────────────────────┐
                    │EscrowImplementation│
                    │  (Proxy instances) │
                    └─────────┬──────────┘
                              │ queries modules
              ┌───────────────┼──────────────────┐
              │               │                  │
              ▼               ▼                  ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │  TimeLockModule  │ │ EmergencyModule  │ │ DisputeResolver  │
    │  (Upgradeable)   │ │  (Upgradeable)   │ │  (Upgradeable)   │
    └──────────────────┘ └──────────────────┘ └──────────────────┘
              │               │                  │
              └───────────────┼──────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ ReputationOracle │
                    │  (Upgradeable)   │
                    └──────────────────┘
```

### 2.2 Multi-Chain Strategy

- **🌐 CREATE3 Deployment**: Same factory address across all chains
- **⛓️ Cross-Chain Consistency**: Unified user experience across networks
- **⛽ Gas Optimization**: Minimal proxy pattern reduces deployment costs

## 3. 📁 Project Structure

```
contract/
├── contracts/                          # Smart contract source code
│   ├── core/                           # Core escrow contracts
│   │   ├── EscrowFactory.sol           # Factory for creating escrows
│   │   └── EscrowImplementation.sol    # Individual escrow logic
│   ├── modules/                        # Security and utility modules
│   │   ├── TimeLockModule.sol          # Anti-coercion time delays
│   │   ├── EmergencyModule.sol         # Panic button functionality
│   │   ├── DisputeResolver.sol         # Multi-tier dispute resolution
│   │   └── ReputationOracle.sol        # Cross-platform reputation
│   ├── interfaces/                     # Contract interfaces
│   ├── deployment/                     # Deployment utilities
│   │   └── CREATE3Deployer.sol         # Deterministic deployment
│   └── test-helpers/                   # Testing utilities
│
├── test/                               # Comprehensive test suite
│   ├── unit/                           # Unit tests for individual contracts
│   ├── integration/                    # Integration tests for modules
│   ├── functional/                     # End-to-end workflow tests
│   ├── modules/                        # Module-specific tests
│   └── helpers/                        # Test utilities and setup
│
├── scripts/                            # Deployment and utility scripts
│   ├── 01_deploy_create3.ts            # Deploy CREATE3 factory
│   ├── 02_deploy_contracts.ts          # Deploy main contracts
│   ├── 03_verify_deployment.ts         # Verify deployment
│   ├── 04_verify_crosschain.ts         # Cross-chain verification
│   ├── deploy_multichain.sh            # Multi-chain deployment
│   └── deploy_single.sh                # Single chain deployment
│
├── docs/                               # Documentation
│   ├── DEPLOYMENT.md                   # Deployment guide
│   └── MODULE_INTEGRATION_GUIDE.md     # Module integration guide
│
├── devdocs/                            # Development documentation
│   ├── ContractDev.md                  # Contract development guide
│   └── MainDevDoc.md                   # Main development documentation
│
└── deployments/                        # Deployment artifacts
```

## 4. 🔧 Core Contracts

### 4.1 EscrowFactory (Upgradeable)
**Path**: `contracts/core/EscrowFactory.sol`

Central factory contract responsible for deploying and managing escrow instances.

**Key Features**:
- ✅ UUPS Upgradeable Pattern
- ✅ Minimal Proxy Deployment
- ✅ Module Integration
- ✅ Access Control & Pausable
- ✅ Comprehensive Error Handling

### 4.2 EscrowImplementation (Upgradeable)
**Path**: `contracts/core/EscrowImplementation.sol`

Individual escrow logic for each trade with full anti-coercion features.

**Key Features**:
- ✅ Anti-coercion time locks
- ✅ Emergency stop mechanisms
- ✅ Dispute resolution integration
- ✅ Reputation system integration
- ✅ Reentrancy protection

### 4.3 Security Modules (All Upgradeable)

#### 4.3.1 TimeLockModule
**Path**: `contracts/modules/TimeLockModule.sol`
- Calculates time-lock durations based on amount
- Handles dispute extensions
- Configurable parameters

#### 4.3.2 EmergencyModule
**Path**: `contracts/modules/EmergencyModule.sol`
- Panic button functionality
- Rate limiting and cooldowns
- Security contact notifications

#### 4.3.3 DisputeResolver
**Path**: `contracts/modules/DisputeResolver.sol`
- Multi-tier dispute resolution
- Arbitrator consensus system
- Automated fee calculations

#### 4.3.4 ReputationOracle
**Path**: `contracts/modules/ReputationOracle.sol`
- Cross-platform reputation scoring
- Dynamic score adjustments
- Reputation decay mechanisms

## 5. 🚀 Quick Start

### 5.1 Prerequisites
- Node.js v18+
- npm or yarn
- Git

### 5.2 Installation

```bash
# Clone the repository
git clone <repository-url>
cd contract

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### 5.3 Testing

```bash
# Run all tests (168 tests passing)
npm test

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:functional    # Functional tests

# Coverage report
npm run coverage
```

### 5.4 Local Development

```bash
# Start local hardhat node
npx hardhat node

# Deploy to local network
npm run deploy:localhost
```

## 6. 🌐 Multi-Chain Deployment

HCKM supports deployment across multiple testnets with deterministic addresses:

### 6.1 Supported Networks
- **Ethereum Sepolia** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)
- **Etherlink Testnet** (Chain ID: 128123)

### 6.2 Deployment Commands

```bash
# Deploy to all networks
./scripts/deploy_multichain.sh

# Deploy to specific network
./scripts/deploy_single.sh sepolia
./scripts/deploy_single.sh baseSepolia
./scripts/deploy_single.sh etherlinkTestnet

# Verify cross-chain consistency
npx hardhat run scripts/04_verify_crosschain.ts
```

### 6.3 Configuration

Copy and configure environment variables:

```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs
```

## 7. 📊 Test Coverage

The project maintains **comprehensive test coverage** with 168 passing tests:

- **Unit Tests**: Individual contract functionality
- **Integration Tests**: Module interactions
- **Functional Tests**: End-to-end workflows
- **Security Tests**: Attack scenarios and edge cases

```bash
# Latest test results
✅ 168 tests passing
❌ 0 tests failing  
⏭️ 0 tests skipped
```

## 8. 🔒 Security Features

### 8.1 Access Control
- Owner-only admin functions
- Module authorization system
- Pausable operations for emergencies

### 8.2 Anti-Coercion Mechanisms
- Mandatory time-lock periods
- Emergency stop with panic codes
- Dispute extension during conflicts

### 8.3 Upgrade Safety
- UUPS pattern with authorization
- Storage gap reservations
- Initialization protection

### 8.4 Gas Optimization
- Minimal proxy deployment (~90% gas savings)
- Packed storage layouts
- Efficient state transitions

## 9. 📚 Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)**: Complete deployment instructions
- **[Module Integration](docs/MODULE_INTEGRATION_GUIDE.md)**: Module architecture and integration

## 10. 🛣️ Current Status

### 10.1 ✅ Completed (Phase 1-2)
- Core factory and implementation contracts
- All four security modules implemented
- Comprehensive testing suite (168 tests)
- Multi-chain deployment infrastructure
- CREATE3 deterministic deployment

### 10.2 🔄 In Progress (Phase 3)
- Mainnet deployment preparation
- Security audit preparation
- Frontend integration interfaces

### 10.3 📋 Planned (Phase 4)
- Advanced KYC integration
- Cross-chain settlement
- Insurance module integration
- AI-powered dispute patterns

## 11. 🔧 Development Commands

```bash
# Compilation
npx hardhat compile

# Testing
npm test                   # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run coverage           # Coverage report

# Deployment
npm run deploy:localhost   # Local deployment
npm run deploy:testnet     # Testnet deployment

# Utilities
npx hardhat clean          # Clean artifacts
npx hardhat typechain      # Generate TypeScript types
```


## 12. 📄 License

MIT License - see [LICENSE](../LICENSE) for details.

## 13. 🔗 Links

- **Repository**: [GitHub](https://github.com/HCKM-Team/Hackers.Market-MVP-for-unite-defi)
- **Documentation**: [HCKM Docs](https://docs.hackers.market) *(in development)*
- **Website**: [Hackers.Market](https://hackers.market) *(coming soon)*

---

**Built with ❤️ for safer P2P trading**