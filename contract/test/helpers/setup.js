const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

/**
 * @title Test Setup Helpers
 * @dev Common setup functions for HCKM contract testing
 */

class TestSetup {
  constructor(options = {}) {
    this.accounts = {};
    this.contracts = {};
    this.config = {
      creationFee: ethers.parseEther("0.0008"),
      defaultAmount: ethers.parseEther("1.0"),
      emergencyHash: ethers.id("emergency123"),
      panicCode: "emergency123",
      useCREATE3: options.useCREATE3 || false, // Enable CREATE3 for cross-chain consistency
      saltPrefix: options.saltPrefix || "HCKM_TEST_" // Salt prefix for deterministic addresses
    };
  }

  /**
   * Setup test accounts with roles
   */
  async setupAccounts() {
    const [owner, seller, buyer, security, attacker, ...others] = await ethers.getSigners();
    
    this.accounts = {
      owner,
      seller,
      buyer,
      security,
      attacker,
      others
    };
    
    return this.accounts;
  }

  /**
   * Deploy all contracts with proper configuration
   */
  async deployContracts() {
    await this.setupAccounts();
    
    if (this.config.useCREATE3) {
      return this._deployWithCREATE3();
    } else {
      return this._deployStandard();
    }
  }

  /**
   * Standard deployment for testing (faster and simpler)
   */
  async _deployStandard() {
    // 1. Deploy TimeLockModule
    const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
    const timeLock = await upgrades.deployProxy(TimeLockModule, [this.accounts.owner.address]);
    await timeLock.waitForDeployment();
    
    // 2. Deploy EmergencyModule
    const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
    const emergency = await upgrades.deployProxy(EmergencyModule, [this.accounts.owner.address]);
    await emergency.waitForDeployment();
    
    // 3. Deploy EscrowImplementation
    const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
    const implementation = await EscrowImplementation.deploy();
    await implementation.waitForDeployment();
    
    // 4. Deploy EscrowFactory
    const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
    const factory = await upgrades.deployProxy(EscrowFactory, [
      await implementation.getAddress(),
      this.accounts.owner.address
    ]);
    await factory.waitForDeployment();
    
    // 5. Register modules in factory
    await factory.setModule("TimeLock", await timeLock.getAddress());
    await factory.setModule("Emergency", await emergency.getAddress());
    
    // 6. Authorize factory in modules
    await timeLock.setAuthorizedCaller(await factory.getAddress(), true);
    await emergency.setAuthorizedCaller(await factory.getAddress(), true);
    
    // Set factory address in emergency module for escrow validation
    await emergency.setFactory(await factory.getAddress());
    
    // 7. Add security contact
    await emergency.addSecurityContact(this.accounts.security.address);
    
    this.contracts = {
      timeLock,
      emergency,
      implementation,
      factory
    };
    
    return this.contracts;
  }

  /**
   * CREATE3 deployment for cross-chain consistency
   */
  async _deployWithCREATE3() {
    // 1. Deploy CREATE3Deployer first
    const CREATE3Deployer = await ethers.getContractFactory("CREATE3Deployer");
    const deployer = await CREATE3Deployer.deploy(this.accounts.owner.address);
    await deployer.waitForDeployment();
    
    // 2. Deploy EscrowImplementation with CREATE3
    const implSalt = ethers.id(this.config.saltPrefix + "IMPLEMENTATION");
    const implementationTx = await deployer.deployEscrowImplementation(implSalt);
    await implementationTx.wait();
    const implementationAddress = await deployer.getDeployedAddress(implSalt);
    const implementation = await ethers.getContractAt("EscrowImplementation", implementationAddress);
    
    // 3. Deploy modules using standard proxy (since they need upgradeability)
    // Note: For production, these could also use CREATE3 with custom proxy deployment
    const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
    const timeLock = await upgrades.deployProxy(TimeLockModule, [this.accounts.owner.address]);
    await timeLock.waitForDeployment();
    
    const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
    const emergency = await upgrades.deployProxy(EmergencyModule, [this.accounts.owner.address]);
    await emergency.waitForDeployment();
    
    // 4. Deploy EscrowFactory using standard proxy (points to CREATE3 implementation)
    const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
    const factory = await upgrades.deployProxy(EscrowFactory, [
      implementationAddress,
      this.accounts.owner.address
    ]);
    await factory.waitForDeployment();
    
    // 5. Register modules in factory
    await factory.setModule("TimeLock", await timeLock.getAddress());
    await factory.setModule("Emergency", await emergency.getAddress());
    
    // 6. Authorize factory in modules
    await timeLock.setAuthorizedCaller(await factory.getAddress(), true);
    await emergency.setAuthorizedCaller(await factory.getAddress(), true);
    
    // Set factory address in emergency module for escrow validation
    await emergency.setFactory(await factory.getAddress());
    
    // 7. Add security contact
    await emergency.addSecurityContact(this.accounts.security.address);
    
    this.contracts = {
      timeLock,
      emergency,
      implementation,
      factory,
      deployer // Include deployer for reference
    };
    
    return this.contracts;
  }

  /**
   * Create a new escrow for testing
   */
  async createEscrow(params = {}) {
    const defaultParams = {
      buyer: this.accounts.buyer.address,
      amount: this.config.defaultAmount,
      description: "Test trade",
      customTimeLock: 0,
      tradeId: ethers.id(`trade-${Date.now()}`)
    };
    
    const escrowParams = { ...defaultParams, ...params };
    
    // Create escrow
    const tx = await this.contracts.factory
      .connect(this.accounts.seller)
      .createEscrow(escrowParams, { value: this.config.creationFee });
    
    const receipt = await tx.wait();
    
    // Extract escrow address from events
    const event = receipt.logs.find(log => {
      try {
        const parsed = this.contracts.factory.interface.parseLog(log);
        return parsed && parsed.name === 'EscrowCreated';
      } catch {
        return false;
      }
    });
    
    if (!event) throw new Error('EscrowCreated event not found');
    const parsedEvent = this.contracts.factory.interface.parseLog(event);
    const escrowAddress = parsedEvent.args.escrow;
    
    // Get escrow contract instance
    const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
    
    return { escrow, escrowAddress, params: escrowParams, tx, receipt };
  }

  /**
   * Fund an escrow (buyer action)
   */
  async fundEscrow(escrow, amount = null, emergencyHash = null) {
    const fundAmount = amount || await escrow.getAmount();
    const hash = emergencyHash || this.config.emergencyHash;
    
    const tx = await escrow
      .connect(this.accounts.buyer)
      .fundEscrow(hash, { value: fundAmount });
    
    return tx.wait();
  }

  /**
   * Complete escrow flow to locked state
   */
  async createAndFundEscrow(params = {}) {
    const { escrow, escrowAddress, params: escrowParams } = await this.createEscrow(params);
    await this.fundEscrow(escrow);
    
    return { escrow, escrowAddress, params: escrowParams };
  }

  /**
   * Complete escrow flow to locked state
   */
  async createFundAndLockEscrow(params = {}) {
    const { escrow, escrowAddress, params: escrowParams } = await this.createAndFundEscrow(params);
    
    // Seller confirms receipt
    await escrow.connect(this.accounts.seller).confirmReceipt();
    
    return { escrow, escrowAddress, params: escrowParams };
  }

  /**
   * Time travel utility for testing time-locks
   */
  async timeTravel(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }

  /**
   * Get latest block timestamp
   */
  async getLatestTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }

  /**
   * Calculate expected time-lock end
   */
  async calculateExpectedTimeLock(amount = null) {
    const tradeAmount = amount || this.config.defaultAmount;
    
    try {
      const duration = await this.contracts.timeLock.getTimeLockForAmount(tradeAmount);
      const currentTime = await this.getLatestTimestamp();
      return currentTime + Number(duration);
    } catch (error) {
      // Fallback to default if module fails
      const currentTime = await this.getLatestTimestamp();
      return currentTime + (24 * 60 * 60); // 24 hours
    }
  }

  /**
   * Assert escrow state
   */
  async assertEscrowState(escrow, expectedState) {
    const actualState = await escrow.getState();
    expect(actualState).to.equal(expectedState);
  }

  /**
   * Assert event emission
   */
  expectEvent(receipt, eventName, expectedArgs = {}) {
    const event = receipt.logs.find(log => {
      try {
        // Try to parse with all possible interfaces
        for (const contract of Object.values(this.contracts)) {
          if (!contract.interface) continue;
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === eventName) {
              return true;
            }
          } catch {
            continue;
          }
        }
        return false;
      } catch {
        return false;
      }
    });
    
    expect(event, `Event ${eventName} not found`).to.not.be.undefined;
    
    // Parse the event to get args
    let parsedEvent;
    for (const contract of Object.values(this.contracts)) {
      if (!contract.interface) continue;
      try {
        const parsed = contract.interface.parseLog(event);
        if (parsed && parsed.name === eventName) {
          parsedEvent = parsed;
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!parsedEvent) {
      throw new Error(`Could not parse event ${eventName}`);
    }
    
    if (Object.keys(expectedArgs).length > 0) {
      for (const [key, value] of Object.entries(expectedArgs)) {
        expect(parsedEvent.args[key]).to.equal(value);
      }
    }
    
    return parsedEvent;
  }

  /**
   * Assert balance change
   */
  async assertBalanceChange(account, expectedChange, transaction) {
    const balanceBefore = await ethers.provider.getBalance(account.address);
    await transaction();
    const balanceAfter = await ethers.provider.getBalance(account.address);
    
    const actualChange = balanceAfter - balanceBefore;
    expect(actualChange).to.be.closeTo(expectedChange, ethers.parseEther("0.01"));
  }

  /**
   * Get gas cost for transaction
   */
  async getGasCost(tx) {
    const receipt = await tx.wait();
    return receipt.gasUsed * receipt.effectiveGasPrice;
  }
}

// Export helper functions
module.exports = {
  TestSetup,
  
  // Common constants
  ESCROW_STATES: {
    Created: 0,
    Funded: 1,
    Locked: 2,
    Released: 3,
    Disputed: 4,
    Emergency: 5,
    Cancelled: 6
  },
  
  // Time constants
  TIME: {
    HOUR: 60 * 60,
    DAY: 24 * 60 * 60,
    WEEK: 7 * 24 * 60 * 60
  },
  
  // Custom error names for ethers v6 custom error matching
  ERRORS: {
    INVALID_STATE: "InvalidState",
    UNAUTHORIZED: "Unauthorized", 
    INSUFFICIENT_AMOUNT: "InsufficientAmount",
    TIMELOCK_ACTIVE: "TimeLockActive",
    EMERGENCY_ACTIVE: "EmergencyActive",
    INVALID_PANIC_CODE: "InvalidPanicCode",
    INSUFFICIENT_FEE: "InsufficientFee",
    INVALID_BUYER: "InvalidBuyer",
    INVALID_AMOUNT: "InvalidAmount",
    INVALID_DESCRIPTION: "InvalidDescription",
    ESCROW_ALREADY_EXISTS: "EscrowAlreadyExists",
    ESCROW_NOT_FOUND: "EscrowNotFound",
    PAUSABLE_PAUSED: "EnforcedPause",
    OWNABLE_UNAUTHORIZED: "OwnableUnauthorizedAccount",
    MAX_ACTIVATIONS_REACHED: "MaxActivationsReached",
    COOLDOWN_PERIOD_ACTIVE: "CooldownPeriodActive",
    INVALID_CONFIGURATION: "InvalidConfiguration"
  }
};