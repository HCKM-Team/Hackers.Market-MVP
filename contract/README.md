# HCKM (Hackers.Market) Smart Contracts

Revolutionary Anti-Coercion P2P Escrow Protocol for Physical Safety in Decentralized Trading

## 1. Overview

HCKM (Hackers.Market) implements the world's first anti-coercion P2P escrow protocol, addressing a critical vulnerability in peer-to-peer trading: **physical coercion attacks**. Our smart contract system protects users from being forced to release escrowed funds prematurely through innovative time-lock mechanisms and emergency intervention systems.

### 1.1 Key Innovation: Anti-Coercion Protocol

Traditional P2P trading platforms fail when attackers gain physical control over victims. HCKM solves this through:

- **Time-Locked Fund Release**: Mandatory waiting periods prevent immediate access
- **Emergency Stop Mechanisms**: Panic code system for duress situations  
- **Automated Dispute Resolution**: AI-driven pattern detection and intervention
- **Decentralized Arbitration**: Community-based resolution for complex disputes

## 2. Contract Architecture

### 2.1 Upgradeable Proxy Pattern Design

All core contracts implement OpenZeppelin's UUPS (Universal Upgradeable Proxy Standard) for future-proof upgradeability:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Proxy Layer   │────│ Implementation  │────│    Storage      │
│                 │    │     Layer       │    │     Layer       │
│ - UUPS Proxy    │    │ - Logic Code    │    │ - State Data    │
│ - Upgrade Logic │    │ - Functions     │    │ - Mappings      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2.2 Core Components

1. **EscrowFactory**: UUPS upgradeable factory deploying minimal proxy escrow instances
2. **EscrowImplementation**: Individual escrow logic for each trade (pending implementation)
3. **Modular Infrastructure**: Pluggable security and verification modules
4. **CREATE3 Deployment**: Deterministic cross-chain addresses using Solady

### 2.3 Multi-Chain Strategy

- **Deterministic Deployment**: Same factory address across all chains via CREATE3
- **Cross-Chain Consistency**: Unified user experience across networks
- **Gas Optimization**: Minimal proxy pattern reduces deployment costs

## 3. Deployed Contracts

### 3.1 Core Contracts (Upgradeable)

#### 3.1.1 EscrowFactory

**Contract**: `contracts/core/EscrowFactory.sol`  
**Interface**: `contracts/interfaces/IEscrowFactory.sol`

The central factory contract responsible for deploying and managing escrow instances.

##### 3.1.1.1 Key Features:
- **UUPS Upgradeable Pattern** for future enhancements
- **Minimal Proxy Deployment** for gas-efficient escrow creation
- **Access Control** with OpenZeppelin's Ownable
- **Pausable Operations** for emergency situations
- **Reentrancy Protection** for secure state changes
- **Comprehensive Error Handling** with custom errors

##### 3.1.1.2 Public Interface:

```solidity
// Core Functions
function createEscrow(CreateEscrowParams calldata params) external returns (address);
function getSellerEscrows(address seller) external view returns (address[] memory);
function getEscrowInfo(address escrow) external view returns (EscrowInfo memory);
function escrowExists(address escrow) external view returns (bool);

// Query Functions  
function getSellerEscrowCount(address seller) external view returns (uint256);
function getTotalEscrows() external view returns (uint256);
function getEscrowByTradeId(bytes32 tradeId) external view returns (address);
function getEscrowImplementation() external view returns (address);
function getModule(string calldata moduleName) external view returns (address);
function isPaused() external view returns (bool);
function version() external pure returns (string memory);

// Admin Functions (Owner Only)
function updateEscrowImplementation(address newImplementation) external;
function setModule(string calldata moduleName, address moduleAddress) external;
function pause() external;
function unpause() external;
```

##### 3.1.1.3 Security Features:
- **Contract Verification**: Validates implementation addresses using assembly
- **Initialization Protection**: Try-catch mechanism for escrow initialization
- **Duplicate Prevention**: Trade ID uniqueness enforcement
- **Parameter Validation**: Comprehensive input sanitization
- **Storage Gap**: 44 slots reserved for future upgrades

##### 3.1.1.4 Events:
```solidity
event EscrowCreated(address indexed escrow, address indexed seller, address indexed buyer, bytes32 tradeId, uint256 amount);
event EscrowImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);
event ModuleUpdated(string moduleName, address indexed oldModule, address indexed newModule);
event FactoryPaused(address indexed admin);
event FactoryUnpaused(address indexed admin);
```

## 4. Data Structures

### 4.1 Core Types

```solidity
enum EscrowState {
    Created,    // Escrow created but not funded
    Funded,     // Buyer has funded the escrow
    Locked,     // Time-lock period active
    Released,   // Funds released to seller
    Disputed,   // Dispute raised, awaiting resolution
    Emergency,  // Emergency stop activated
    Cancelled   // Escrow cancelled, funds returned
}

struct CreateEscrowParams {
    address buyer;           // Buyer's address
    uint256 amount;          // Escrow amount in wei
    string description;      // Trade description
    uint256 customTimeLock;  // Custom time-lock override (0 = use default)
    bytes32 tradeId;        // Unique trade identifier
}

struct EscrowInfo {
    address seller;          // Seller's address
    address buyer;           // Buyer's address
    uint256 amount;          // Escrow amount
    EscrowState state;       // Current state
    uint256 timeLockEnd;     // Time-lock expiration timestamp
    string description;      // Trade description
    bytes32 tradeId;        // Trade identifier
    bool emergencyActive;    // Emergency stop status
    uint256 createdAt;      // Creation timestamp
    uint256 updatedAt;      // Last update timestamp
}
```

## 5. Development Setup

### 5.1 Prerequisites
- Node.js v18+
- npm or yarn
- Hardhat

### 5.2 Installation

```bash
npm install
```

### 5.3 Key Dependencies
- `@openzeppelin/contracts-upgradeable`: Upgradeable contract standards
- `@openzeppelin/hardhat-upgrades`: Hardhat upgrade plugin  
- `solady`: CREATE3 deterministic deployment
- `@nomicfoundation/hardhat-toolbox`: Complete Hardhat toolkit

### 5.4 Compilation

```bash
npx hardhat compile
```

### 5.5 Testing

```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run coverage           # Test coverage report
```

### 5.6 Deployment

```bash
npm run deploy:localhost   # Local deployment
npm run deploy:testnet     # Testnet deployment
npm run deploy:mainnet     # Mainnet deployment
```

## 6. Technical Specifications

### 6.1 Security Standards
- **Solidity**: ^0.8.20
- **OpenZeppelin**: Upgradeable contracts v5.4.0
- **Audit Requirements**: Comprehensive security audit mandatory before mainnet
- **Test Coverage**: >90% required for all contracts
- **Formal Verification**: Recommended for critical functions

### 6.2 Gas Optimization
- **Minimal Proxy Pattern**: ~90% gas savings on escrow deployment
- **Packed Storage**: Optimized struct layouts for reduced storage costs
- **Batch Operations**: Multiple actions in single transaction where possible
- **Efficient State Transitions**: Minimized storage writes per operation

### 6.3 Upgrade Safety
- **UUPS Pattern**: Gas-efficient upgrades with built-in authorization
- **Storage Gaps**: Reserved slots prevent storage collisions
- **Initialization Guards**: Prevent double initialization attacks
- **Access Control**: Multi-signature requirements for critical upgrades

## 7. Roadmap

### 7.1 Phase 1: Factory Infrastructure (Current)
- [x] Core interfaces and data structures
- [x] EscrowFactory upgradeable contract
- [x] Security audit and testing framework
- [x] CREATE3 deployment strategy

### 7.2 Phase 2: Escrow Implementation (In Progress)
- [ ] EscrowImplementation contract
- [ ] TimeLockModule for anti-coercion delays
- [ ] EmergencyModule for panic button functionality
- [ ] Basic dispute resolution mechanism

### 7.3 Phase 3: Advanced Security Modules
- [ ] KYCModule with multi-DID integration
- [ ] ReputationOracle for cross-platform scoring
- [ ] Advanced dispute resolution with AI patterns
- [ ] Insurance integration modules

### 7.4 Phase 4: External Integrations
- [ ] 1inch Fusion+ integration for optimal swaps
- [ ] Circle USDC/EURC multi-chain support
- [ ] LayerZero OFT for governance token
- [ ] Cross-chain settlement mechanisms

## 8. Security Considerations

### 8.1 Audited Components
- **EscrowFactory**: Core factory logic and upgradeability
- **Access Controls**: Admin function security (pending implementation review)
- **Proxy Safety**: UUPS upgrade mechanisms (pending audit)

### 8.2 Known Limitations (Pre-Implementation)
- EscrowImplementation contract not yet implemented
- Module system architecture in development
- Cross-chain functionality pending LayerZero integration

## 9. License

MIT License - see [LICENSE](../LICENSE) for details.

---