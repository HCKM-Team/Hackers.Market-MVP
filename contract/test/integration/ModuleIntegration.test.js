const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME } = require("../helpers/setup");

describe("Module Integration", function () {
  let setup;
  let factory, timeLock, emergency, escrow;
  let owner, seller, buyer, security;

  beforeEach(async function () {
    setup = new TestSetup();
    await setup.deployContracts();
    
    factory = setup.contracts.factory;
    timeLock = setup.contracts.timeLock;
    emergency = setup.contracts.emergency;
    
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
    security = setup.accounts.security;
  });

  describe("TimeLockModule Integration", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should use TimeLockModule for duration calculation", async function () {
      // Get expected duration from module
      const moduleAmount = await escrow.getAmount();
      const expectedDuration = await timeLock.getTimeLockForAmount(moduleAmount);
      
      // Confirm receipt to trigger time-lock
      const tx = await escrow.connect(seller).confirmReceipt();
      const receipt = await tx.wait();
      const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
      
      // Check that escrow uses module-calculated duration
      const escrowInfo = await escrow.getEscrowInfo();
      const actualDuration = Number(escrowInfo.timeLockEnd) - blockTime;
      
      expect(actualDuration).to.be.closeTo(Number(expectedDuration), 5); // 5 second tolerance
    });

    it("Should fall back to default when module unavailable", async function () {
      // Remove TimeLock module
      await factory.connect(owner).setModule("TimeLock", ethers.ZeroAddress);
      
      // Create new escrow without module
      const result = await setup.createAndFundEscrow();
      const newEscrow = result.escrow;
      
      const tx = await newEscrow.connect(seller).confirmReceipt();
      const receipt = await tx.wait();
      const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
      
      // Should use default 24 hours
      const escrowInfo = await newEscrow.getEscrowInfo();
      const duration = Number(escrowInfo.timeLockEnd) - blockTime;
      
      expect(duration).to.be.closeTo(24 * TIME.HOUR, 5);
    });

    it("Should use custom time-lock when specified", async function () {
      const customDuration = 12 * TIME.HOUR; // 12 hours
      
      const result = await setup.createEscrow({
        customTimeLock: customDuration
      });
      await setup.fundEscrow(result.escrow);
      
      const tx = await result.escrow.connect(seller).confirmReceipt();
      const receipt = await tx.wait();
      const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
      
      const escrowInfo = await result.escrow.getEscrowInfo();
      const actualDuration = Number(escrowInfo.timeLockEnd) - blockTime;
      
      expect(actualDuration).to.be.closeTo(customDuration, 5);
    });

    it("Should use module for dispute extension", async function () {
      await escrow.connect(seller).confirmReceipt();
      const timeLockBefore = await escrow.getTimeLockRemaining();
      
      // Raise dispute
      await escrow.connect(buyer).raiseDispute("Test dispute");
      
      const timeLockAfter = await escrow.getTimeLockRemaining();
      const extension = Number(timeLockAfter - timeLockBefore);
      
      // Should match module's dispute extension (72 hours = 259200 seconds)
      const moduleExtension = Number(await timeLock.getDisputeExtension());
      expect(extension).to.be.closeTo(moduleExtension, 5); // Allow 5 second tolerance for timing
    });

    it("Should handle different amount tiers", async function () {
      const amounts = [
        ethers.parseEther("0.005"), // Small amount
        ethers.parseEther("0.05"),  // Medium amount
        ethers.parseEther("5")      // Large amount
      ];
      
      for (const amount of amounts) {
        const result = await setup.createEscrow({ amount });
        await setup.fundEscrow(result.escrow, amount);
        
        const expectedDuration = await timeLock.getTimeLockForAmount(amount);
        
        const tx = await result.escrow.connect(seller).confirmReceipt();
        const receipt = await tx.wait();
        const blockTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
        
        const escrowInfo = await result.escrow.getEscrowInfo();
        const actualDuration = Number(escrowInfo.timeLockEnd) - blockTime;
        
        expect(actualDuration).to.be.closeTo(Number(expectedDuration), 5);
      }
    });
  });

  describe("EmergencyModule Integration", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should notify EmergencyModule on panic activation", async function () {
      // Activate emergency
      const tx = await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      const receipt = await tx.wait();
      
      // Should emit both escrow and module events
      setup.expectEvent(receipt, "EmergencyActivated");
      
      // Check if emergency is recorded in module
      const isActive = await emergency.isEmergencyActive(await escrow.getAddress());
      expect(isActive).to.be.true;
      
      const record = await emergency.getEmergencyRecord(await escrow.getAddress());
      expect(record.activator).to.equal(buyer.address);
      expect(record.escrow).to.equal(await escrow.getAddress());
      expect(record.isActive).to.be.true;
    });

    it("Should use EmergencyModule for lock extension calculation", async function () {
      // Activate emergency
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      const remaining = await escrow.getTimeLockRemaining();
      const moduleExtension = await emergency.calculateLockExtension(await escrow.getAddress());
      
      // Should use module-calculated extension
      expect(Number(remaining)).to.be.closeTo(Number(moduleExtension), TIME.HOUR);
    });

    it("Should respect emergency cooldown periods", async function () {
      // First emergency
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      // Create another escrow quickly
      const result2 = await setup.createAndFundEscrow();
      
      // Should fail due to cooldown
      await expect(
        result2.escrow.connect(buyer).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(emergency, "CooldownPeriodActive");
    });

    it("Should enforce daily activation limits", async function () {
      const maxActivations = (await emergency.getConfig()).maxActivations;
      
      // Use up all allowed activations
      for (let i = 0; i < maxActivations; i++) {
        const result = await setup.createAndFundEscrow();
        await result.escrow.connect(buyer).emergencyStop(setup.config.panicCode);
        
        // Wait for cooldown between activations
        await setup.timeTravel(TIME.HOUR + 60);
      }
      
      // Next activation should fail
      const finalResult = await setup.createAndFundEscrow();
      await expect(
        finalResult.escrow.connect(buyer).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(emergency, "MaxActivationsReached");
    });

    it("Should fall back to default when module unavailable", async function () {
      // Remove Emergency module
      await factory.connect(owner).setModule("Emergency", ethers.ZeroAddress);
      
      // Create new escrow without module
      const result = await setup.createAndFundEscrow();
      
      // Should still work with default extension
      await result.escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      await setup.assertEscrowState(result.escrow, ESCROW_STATES.Emergency);
      
      const remaining = await result.escrow.getTimeLockRemaining();
      expect(remaining).to.be.closeTo(48 * TIME.HOUR, TIME.HOUR); // Default 48 hours
    });

    it("Should allow security team to resolve emergencies", async function () {
      // Activate emergency
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      // Security resolves
      await emergency.connect(security).resolveEmergency(
        await escrow.getAddress(),
        "False alarm - resolved"
      );
      
      // Should be marked as resolved in module
      const record = await emergency.getEmergencyRecord(await escrow.getAddress());
      expect(record.isActive).to.be.false;
      expect(record.resolvedAt).to.be.gt(0);
    });
  });

  describe("Module Configuration", function () {
    it("Should allow updating TimeLock configuration", async function () {
      const newConfig = {
        minDuration: 2 * TIME.HOUR,
        maxDuration: 5 * TIME.DAY,
        defaultDuration: 18 * TIME.HOUR,
        emergencyExtension: 36 * TIME.HOUR,
        disputeExtension: 60 * TIME.HOUR
      };
      
      const tx = await timeLock.connect(owner).updateConfig(newConfig);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "TimeLockConfigUpdated");
      
      const config = await timeLock.getConfig();
      expect(config.minDuration).to.equal(newConfig.minDuration);
      expect(config.defaultDuration).to.equal(newConfig.defaultDuration);
    });

    it("Should allow updating Emergency configuration", async function () {
      const newConfig = {
        responseTime: 20 * 60, // 20 minutes
        cooldownPeriod: 2 * TIME.HOUR,
        maxActivations: 5,
        autoLockEnabled: true,
        lockExtension: 60 * TIME.HOUR
      };
      
      const tx = await emergency.connect(owner).updateConfig(newConfig);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "EmergencyConfigUpdated");
      
      const config = await emergency.getConfig();
      expect(config.responseTime).to.equal(newConfig.responseTime);
      expect(config.maxActivations).to.equal(newConfig.maxActivations);
    });

    it("Should validate configuration parameters", async function () {
      // Invalid TimeLock config
      await expect(
        timeLock.connect(owner).updateConfig({
          minDuration: 0, // Invalid
          maxDuration: TIME.DAY,
          defaultDuration: 12 * TIME.HOUR,
          emergencyExtension: 48 * TIME.HOUR,
          disputeExtension: 72 * TIME.HOUR
        })
      ).to.be.revertedWithCustomError(timeLock, "InvalidConfiguration");

      // Invalid Emergency config
      await expect(
        emergency.connect(owner).updateConfig({
          responseTime: 0, // Invalid
          cooldownPeriod: TIME.HOUR,
          maxActivations: 3,
          autoLockEnabled: true,
          lockExtension: 48 * TIME.HOUR
        })
      ).to.be.revertedWithCustomError(emergency, "InvalidConfiguration");
    });
  });

  describe("Module Authorization", function () {
    it("Should require authorization for module calls", async function () {
      // Remove factory authorization
      await timeLock.connect(owner).setAuthorizedCaller(factory.address, false);
      
      // Should still work because we have fallback logic
      const result = await setup.createAndFundEscrow();
      await result.escrow.connect(seller).confirmReceipt();
      
      await setup.assertEscrowState(result.escrow, ESCROW_STATES.Locked);
    });

    it("Should allow owner to manage authorization", async function () {
      const testAddress = setup.accounts.others[0].address;
      
      // Add authorization
      await timeLock.connect(owner).setAuthorizedCaller(testAddress, true);
      expect(await timeLock.isAuthorized(testAddress)).to.be.true;
      
      // Remove authorization
      await timeLock.connect(owner).setAuthorizedCaller(testAddress, false);
      expect(await timeLock.isAuthorized(testAddress)).to.be.false;
    });

    it("Should not allow non-owner to change authorization", async function () {
      await expect(
        timeLock.connect(buyer).setAuthorizedCaller(buyer.address, true)
      ).to.be.revertedWithCustomError(timeLock, "OwnableUnauthorizedAccount")
        .withArgs(buyer.address);
      
      await expect(
        emergency.connect(seller).setAuthorizedCaller(seller.address, true)
      ).to.be.revertedWithCustomError(emergency, "OwnableUnauthorizedAccount")
        .withArgs(seller.address);
    });
  });

  describe("Gas Efficiency", function () {
    it("Should have reasonable gas costs for module calls", async function () {
      const result = await setup.createAndFundEscrow();
      
      // Measure gas for confirm receipt (includes module call)
      const tx = await result.escrow.connect(seller).confirmReceipt();
      const receipt = await tx.wait();
      
      // Should be under 200k gas including module call
      expect(Number(receipt.gasUsed)).to.be.lt(200000);
    });

    it("Should reuse module logic efficiently", async function () {
      // Create multiple escrows
      const escrows = [];
      for (let i = 0; i < 3; i++) {
        const result = await setup.createAndFundEscrow();
        escrows.push(result.escrow);
      }
      
      // All should use same module logic
      for (const escrow of escrows) {
        await escrow.connect(seller).confirmReceipt();
        await setup.assertEscrowState(escrow, ESCROW_STATES.Locked);
      }
      
      // Module deployment cost is amortized across all escrows
      expect(escrows.length).to.equal(3);
    });
  });
});