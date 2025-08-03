# Module Integration Guide for HCKM Smart Contracts

## Overview
This guide explains how the TimeLockModule and EmergencyModule are integrated with the EscrowImplementation and EscrowFactory contracts.

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
         └────────────────────────────────────►│ EmergencyModule  │
                                               │  (Upgradeable)   │
                                               └──────────────────┘
```

## Integration Flow

### 1. Module Registration in Factory

The EscrowFactory stores module addresses in a mapping:
```solidity
_modules["TimeLock"] = timeLockModuleAddress;
_modules["Emergency"] = emergencyModuleAddress;
```

### 2. Module Query by Escrow

When an escrow needs module functionality, it queries the factory:
```solidity
IEscrowFactory(_factory).getModule("TimeLock")
```

### 3. Graceful Fallbacks

If modules are not set or fail, escrows use default values:
- Default time-lock: 24 hours
- Default emergency extension: 48 hours
- Default dispute extension: 72 hours

## Deployment Steps

### Step 1: Deploy Core Contracts

```javascript
// 1. Deploy modules
const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
const timeLock = await upgrades.deployProxy(TimeLockModule, [owner.address]);

const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
const emergency = await upgrades.deployProxy(EmergencyModule, [owner.address]);

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
```

### Step 3: Authorize Callers

```javascript
// Authorize factory in modules
await timeLock.setAuthorizedCaller(factory.address, true);
await emergency.setAuthorizedCaller(factory.address, true);

// If escrows need direct access
await timeLock.setAuthorizedCaller(implementation.address, true);
await emergency.setAuthorizedCaller(implementation.address, true);
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

## Benefits of Modular Architecture

1. **Upgradeable Logic**: Modules can be upgraded independently
2. **Flexible Configuration**: Parameters can be adjusted without redeploying escrows
3. **Graceful Degradation**: Escrows work even without modules
4. **Gas Efficiency**: Modules deployed once, used by all escrows
5. **Separation of Concerns**: Clean architecture with single responsibilities

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
- Check module name spelling matches exactly

### Unauthorized Errors
- Verify caller is authorized: `module.setAuthorizedCaller(address, true)`
- Check owner permissions for admin functions

### Module Calls Failing
- Modules use try-catch, so failures are silent
- Check module configuration is valid
- Ensure modules are properly initialized

## Security Considerations

1. **Access Control**: Only authorized contracts can call modules
2. **Fallback Values**: Safe defaults prevent system failure
3. **No Reverts**: Module failures don't break escrow functionality
4. **Upgrade Safety**: UUPS pattern with owner-only upgrades
5. **Configuration Limits**: Validated parameters prevent extreme values