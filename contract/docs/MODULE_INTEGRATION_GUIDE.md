# Module Integration Guide for HCKM Smart Contracts

## Overview
This guide explains how all four modules (TimeLockModule, EmergencyModule, DisputeResolver, and ReputationOracle) are integrated with the EscrowImplementation and EscrowFactory contracts.

## Architecture

```
┌─────────────────┐
│  EscrowFactory  │
│   (Upgradeable) │
└────────┬────────┘
         │ deploys & manages
         ▼
┌─────────────────┐      queries modules      ┌──────────────────┐
│EscrowImplementation│◄──────────────────────►│  TimeLockModule  │
│  (Proxy instances) │                         │  (Upgradeable)   │
└─────────────────┘                           └──────────────────┘
         ▲                                              
         │ queries modules                     ┌──────────────────┐
         ├────────────────────────────────────►│ EmergencyModule  │
         │                                    │  (Upgradeable)   │
         │                                    └──────────────────┘
         │                                              
         │                                    ┌──────────────────┐
         ├────────────────────────────────────►│ DisputeResolver  │
         │                                    │  (Upgradeable)   │
         │                                    └──────────────────┘
         │                                              
         │                                    ┌──────────────────┐
         └────────────────────────────────────►│ ReputationOracle │
                                               │  (Upgradeable)   │
                                               └──────────────────┘
```

## Integration Flow

### 1. Module Registration in Factory

The EscrowFactory stores module addresses in a mapping:
```solidity
_modules["TimeLock"] = timeLockModuleAddress;
_modules["Emergency"] = emergencyModuleAddress;
_modules["Dispute"] = disputeResolverAddress;
_modules["Reputation"] = reputationOracleAddress;
```

### 2. Module Query by Escrow

When an escrow needs module functionality, it queries the factory:
```solidity
IEscrowFactory(_factory).getModule("TimeLock");
IEscrowFactory(_factory).getModule("Emergency");
IEscrowFactory(_factory).getModule("Dispute");
IEscrowFactory(_factory).getModule("Reputation");
```

### 3. Graceful Fallbacks

If modules are not set or fail, escrows use default values:
- Default time-lock: 24 hours
- Default emergency extension: 48 hours
- Default dispute extension: 72 hours
- Default arbitration fee: 0.01 ETH
- Default reputation score: 50 (neutral)

## Deployment Steps

### Step 1: Deploy Core Contracts

```javascript
// 1. Deploy modules
const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
const timeLock = await upgrades.deployProxy(TimeLockModule, [owner.address]);

const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
const emergency = await upgrades.deployProxy(EmergencyModule, [owner.address]);

const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
const dispute = await upgrades.deployProxy(DisputeResolver, [owner.address]);

const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
const reputation = await upgrades.deployProxy(ReputationOracle, [owner.address]);

// 2. Deploy EscrowImplementation
const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
const implementation = await EscrowImplementation.deploy();

// 3. Deploy EscrowFactory
const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
const factory = await upgrades.deployProxy(EscrowFactory, [
    implementation.address,
    owner.address
]);
```

### Step 2: Register Modules

```javascript
// Register modules in factory
await factory.setModule("TimeLock", timeLock.address);
await factory.setModule("Emergency", emergency.address);
await factory.setModule("Dispute", dispute.address);
await factory.setModule("Reputation", reputation.address);
```

### Step 3: Authorize Callers

```javascript
// Authorize factory in modules
await timeLock.setAuthorizedCaller(factory.address, true);
await emergency.setAuthorizedCaller(factory.address, true);
await dispute.setAuthorizedCaller(factory.address, true);
await reputation.setAuthorizedCaller(factory.address, true);

// If escrows need direct access
await timeLock.setAuthorizedCaller(implementation.address, true);
await emergency.setAuthorizedCaller(implementation.address, true);
await dispute.setAuthorizedCaller(implementation.address, true);
await reputation.setAuthorizedCaller(implementation.address, true);
```

### Step 4: Configure Modules (Optional)

```javascript
// Configure TimeLockModule
await timeLock.updateConfig({
    minDuration: 3600,      // 1 hour
    maxDuration: 604800,    // 7 days
    defaultDuration: 86400,  // 24 hours
    emergencyExtension: 172800, // 48 hours
    disputeExtension: 259200    // 72 hours
});

// Configure EmergencyModule
await emergency.updateConfig({
    responseTime: 1800,      // 30 minutes
    cooldownPeriod: 3600,    // 1 hour
    maxActivations: 3,       // 3 per day
    autoLockEnabled: true,
    lockExtension: 172800    // 48 hours
});

// Add security contacts
await emergency.addSecurityContact(securityTeam.address);

// Configure DisputeResolver
await dispute.updateConfig({
    arbitrationFee: ethers.parseEther("0.01"), // 0.01 ETH
    responseTime: 86400,        // 24 hours
    escalationTime: 259200,     // 72 hours
    maxArbitrators: 3,
    consensusThreshold: 2       // 2/3 consensus
});

// Configure ReputationOracle
await reputation.updateConfig({
    baseScore: 50,              // Neutral starting score
    maxScore: 100,              // Maximum reputation
    minScore: 0,                // Minimum reputation
    decayRate: 5,               // 5% decay per month
    successBonus: 5,            // +5 for successful trades
    disputeBonus: 10,           // +10 for winning disputes
    disputePenalty: 15          // -15 for losing disputes
});
```

## Module Functions Used by Escrow

### TimeLockModule Integration

1. **Time-lock Calculation** (`confirmReceipt`)
   - Queries: `getTimeLockForAmount(amount)`
   - Used when: Seller confirms receipt
   - Fallback: 24 hours

2. **Dispute Extension** (`raiseDispute`)
   - Queries: `getDisputeExtension()`
   - Used when: Dispute is raised
   - Fallback: 72 hours

### EmergencyModule Integration

1. **Emergency Extension** (`emergencyStop`)
   - Queries: `calculateLockExtension(escrowAddress)`
   - Used when: Panic button activated
   - Fallback: 48 hours

2. **Emergency Notification** (`emergencyStop`)
   - Calls: `activateEmergency(escrow, codeHash, reason)`
   - Used when: Panic button activated
   - Fallback: Silent failure (no revert)

### DisputeResolver Integration

1. **Dispute Initiation** (`raiseDispute`)
   - Calls: `createDispute(escrow, amount, seller, buyer, reason)`
   - Used when: Either party raises a dispute
   - Fallback: Basic dispute state without arbitration

2. **Arbitration Fee** (`raiseDispute`)
   - Queries: `getArbitrationFee(amount)`
   - Used when: Calculating required dispute fee
   - Fallback: 0.01 ETH

3. **Dispute Resolution** (`resolveDispute`)
   - Calls: `resolveDispute(disputeId, winner, distribution)`
   - Used when: Arbitrator decides dispute outcome
   - Fallback: Manual resolution by owner

### ReputationOracle Integration

1. **Score Query** (`createEscrow`, `fundEscrow`)
   - Queries: `getReputationScore(user)`
   - Used when: Checking user reliability
   - Fallback: 50 (neutral score)

2. **Score Update** (`releaseFunds`, `resolveDispute`)
   - Calls: `updateReputation(user, action, amount)`
   - Used when: Trade completes or dispute resolves
   - Fallback: Silent failure (no revert)

3. **Reputation Decay** (periodic)
   - Calls: `applyDecay(user)`
   - Used when: Maintaining active reputation scores
   - Fallback: No automatic decay

## Benefits of Modular Architecture

1. **Upgradeable Logic**: Modules can be upgraded independently
2. **Flexible Configuration**: Parameters can be adjusted without redeploying escrows
3. **Graceful Degradation**: Escrows work even without modules
4. **Gas Efficiency**: Modules deployed once, used by all escrows
5. **Separation of Concerns**: Clean architecture with single responsibilities
6. **Cross-Chain Consistency**: Same module logic across all supported chains
7. **Extensible Design**: New modules can be added without changing core contracts
8. **Risk Isolation**: Module failures don't compromise core escrow functionality

## Testing the Integration

```javascript
// Test module integration
describe("Module Integration", function() {
    it("Should use TimeLockModule for duration calculation", async function() {
        // Create escrow with factory
        const tx = await factory.createEscrow({
            buyer: buyer.address,
            amount: ethers.utils.parseEther("1"),
            description: "Test trade",
            customTimeLock: 0, // Use module calculation
            tradeId: ethers.utils.id("trade-001")
        }, { value: creationFee });
        
        // Get escrow address
        const escrowAddress = await factory.getEscrowByTradeId(tradeId);
        const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
        
        // Fund and confirm
        await escrow.connect(buyer).fundEscrow(emergencyHash, { value: amount });
        await escrow.connect(seller).confirmReceipt();
        
        // Check time-lock was set from module
        const timeLock = await escrow.getTimeLockRemaining();
        expect(timeLock).to.be.gt(0);
    });
});
```

## Troubleshooting

### Module Not Found
- Ensure module is registered: `factory.setModule("ModuleName", address)`
- Check module name spelling matches exactly (TimeLock, Emergency, Dispute, Reputation)

### Unauthorized Errors
- Verify caller is authorized: `module.setAuthorizedCaller(address, true)`
- Check owner permissions for admin functions
- Ensure factory and implementation addresses are authorized

### Module Calls Failing
- Modules use try-catch, so failures are silent
- Check module configuration is valid
- Ensure modules are properly initialized
- Verify module proxy contracts are correctly deployed

### Dispute Resolution Issues
- Check arbitration fee is paid: `msg.value >= getArbitrationFee(amount)`
- Ensure arbitrators are properly configured
- Verify dispute is within resolution timeframe

### Reputation Score Problems
- Scores range from 0-100, check for valid ranges
- Ensure reputation updates are called after trade events
- Check for reputation decay if scores seem outdated

## Security Considerations

1. **Access Control**: Only authorized contracts can call modules
2. **Fallback Values**: Safe defaults prevent system failure
3. **No Reverts**: Module failures don't break escrow functionality
4. **Upgrade Safety**: UUPS pattern with owner-only upgrades
5. **Configuration Limits**: Validated parameters prevent extreme values
6. **Dispute Arbitration**: Multi-arbitrator consensus prevents single points of failure
7. **Reputation Integrity**: Score updates are validated and rate-limited
8. **Emergency Controls**: Panic button with cooldown prevents abuse
9. **Financial Security**: Arbitration fees protect against frivolous disputes
10. **Cross-Module Isolation**: Module failures don't cascade to other modules