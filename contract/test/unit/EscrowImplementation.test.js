const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME, ERRORS } = require("../helpers/setup");

describe("EscrowImplementation", function () {
  let setup;
  let factory, escrow;
  let owner, seller, buyer, attacker;

  beforeEach(async function () {
    setup = new TestSetup();
    await setup.deployContracts();
    
    factory = setup.contracts.factory;
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
    attacker = setup.accounts.attacker;
  });

  describe("Escrow Lifecycle - Created State", function () {
    beforeEach(async function () {
      const result = await setup.createEscrow();
      escrow = result.escrow;
    });

    it("Should initialize with correct values", async function () {
      await setup.assertEscrowState(escrow, ESCROW_STATES.Created);
      
      expect(await escrow.getSeller()).to.equal(seller.address);
      expect(await escrow.getBuyer()).to.equal(buyer.address);
      expect(await escrow.getAmount()).to.equal(setup.config.defaultAmount);
      expect(await escrow.getBalance()).to.equal(0);
    });

    it("Should allow seller to cancel", async function () {
      const tx = await escrow.connect(seller).cancelEscrow();
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "StateChanged", {
        oldState: ESCROW_STATES.Created,
        newState: ESCROW_STATES.Cancelled
      });
      
      await setup.assertEscrowState(escrow, ESCROW_STATES.Cancelled);
    });

    it("Should allow buyer to cancel", async function () {
      await escrow.connect(buyer).cancelEscrow();
      await setup.assertEscrowState(escrow, ESCROW_STATES.Cancelled);
    });

    it("Should not allow non-parties to cancel", async function () {
      await expect(
        escrow.connect(attacker).cancelEscrow()
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
  });

  describe("Escrow Lifecycle - Funding", function () {
    beforeEach(async function () {
      const result = await setup.createEscrow();
      escrow = result.escrow;
    });

    it("Should allow buyer to fund with correct amount", async function () {
      const tx = await escrow
        .connect(buyer)
        .fundEscrow(setup.config.emergencyHash, { 
          value: setup.config.defaultAmount 
        });
      
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "EscrowFunded", {
        buyer: buyer.address,
        amount: setup.config.defaultAmount,
        emergencyHash: setup.config.emergencyHash
      });
      
      setup.expectEvent(receipt, "StateChanged", {
        oldState: ESCROW_STATES.Created,
        newState: ESCROW_STATES.Funded
      });
      
      await setup.assertEscrowState(escrow, ESCROW_STATES.Funded);
      expect(await escrow.getBalance()).to.equal(setup.config.defaultAmount);
    });

    it("Should reject funding with wrong amount", async function () {
      const wrongAmount = setup.config.defaultAmount - ethers.parseEther("0.1");
      
      await expect(
        escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, { 
          value: wrongAmount 
        })
      ).to.be.revertedWithCustomError(escrow, "InsufficientAmount");
    });

    it("Should reject funding with zero emergency hash", async function () {
      await expect(
        escrow.connect(buyer).fundEscrow(ethers.ZeroHash, { 
          value: setup.config.defaultAmount 
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidEmergencyHash");
    });

    it("Should only allow buyer to fund", async function () {
      await expect(
        escrow.connect(seller).fundEscrow(setup.config.emergencyHash, { 
          value: setup.config.defaultAmount 
        })
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");

      await expect(
        escrow.connect(attacker).fundEscrow(setup.config.emergencyHash, { 
          value: setup.config.defaultAmount 
        })
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should reject double funding", async function () {
      // First funding
      await escrow
        .connect(buyer)
        .fundEscrow(setup.config.emergencyHash, { 
          value: setup.config.defaultAmount 
        });

      // Second funding should fail
      await expect(
        escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, { 
          value: setup.config.defaultAmount 
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("Escrow Lifecycle - Locking", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should allow seller to confirm receipt", async function () {
      const tx = await escrow.connect(seller).confirmReceipt();
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "StateChanged", {
        oldState: ESCROW_STATES.Funded,
        newState: ESCROW_STATES.Locked
      });
      
      // Should emit TimeLockUpdated event
      setup.expectEvent(receipt, 'TimeLockUpdated');
      
      await setup.assertEscrowState(escrow, ESCROW_STATES.Locked);
      
      // Time-lock should be active
      const remaining = await escrow.getTimeLockRemaining();
      expect(remaining).to.be.gt(0);
    });

    it("Should only allow seller to confirm receipt", async function () {
      await expect(
        escrow.connect(buyer).confirmReceipt()
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");

      await expect(
        escrow.connect(attacker).confirmReceipt()
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should use TimeLockModule for duration calculation", async function () {
      await escrow.connect(seller).confirmReceipt();
      
      const escrowInfo = await escrow.getEscrowInfo();
      const currentTime = await setup.getLatestTimestamp();
      
      // Time-lock should be set to future timestamp
      expect(escrowInfo.timeLockEnd).to.be.gt(currentTime);
      
      // Should be reasonable duration (between 1 hour and 7 days)
      const duration = Number(escrowInfo.timeLockEnd) - currentTime;
      expect(duration).to.be.gte(TIME.HOUR);
      expect(duration).to.be.lte(7 * TIME.DAY);
    });
  });

  describe("Escrow Lifecycle - Release", function () {
    beforeEach(async function () {
      const result = await setup.createFundAndLockEscrow();
      escrow = result.escrow;
    });

    it("Should not allow release before time-lock expires", async function () {
      await expect(
        escrow.releaseFunds()
      ).to.be.revertedWithCustomError(escrow, "TimeLockActive");
    });

    it("Should allow release after time-lock expires", async function () {
      // Fast forward time past lock period
      await setup.timeTravel(25 * TIME.HOUR); // 25 hours > default 24 hours
      
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      const tx = await escrow.releaseFunds();
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "StateChanged", {
        oldState: ESCROW_STATES.Locked,
        newState: ESCROW_STATES.Released
      });
      
      setup.expectEvent(receipt, "FundsReleased", {
        recipient: seller.address,
        amount: setup.config.defaultAmount
      });
      
      // Check seller received funds
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(setup.config.defaultAmount);
      
      // Check escrow is empty
      expect(await escrow.getBalance()).to.equal(0);
      await setup.assertEscrowState(escrow, ESCROW_STATES.Released);
    });

    it("Should allow anyone to trigger release after expiry", async function () {
      await setup.timeTravel(25 * TIME.HOUR);
      
      // Attacker can trigger release (benefits seller)
      await escrow.connect(attacker).releaseFunds();
      await setup.assertEscrowState(escrow, ESCROW_STATES.Released);
    });

    it("Should check time-lock expiry status", async function () {
      expect(await escrow.isTimeLockExpired()).to.be.false;
      
      await setup.timeTravel(25 * TIME.HOUR);
      
      expect(await escrow.isTimeLockExpired()).to.be.true;
    });
  });

  describe("Emergency Stop Functionality", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should allow buyer to activate emergency with correct panic code", async function () {
      const tx = await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "EmergencyActivated", {
        activator: buyer.address
      });
      
      setup.expectEvent(receipt, "StateChanged", {
        oldState: ESCROW_STATES.Funded,
        newState: ESCROW_STATES.Emergency
      });
      
      await setup.assertEscrowState(escrow, ESCROW_STATES.Emergency);
      
      // Should extend time-lock
      const remaining = await escrow.getTimeLockRemaining();
      expect(remaining).to.be.gt(40 * TIME.HOUR); // At least 40+ hours
    });

    it("Should work from Locked state too", async function () {
      // Move to locked state first
      await escrow.connect(seller).confirmReceipt();
      await setup.assertEscrowState(escrow, ESCROW_STATES.Locked);
      
      // Then activate emergency
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      await setup.assertEscrowState(escrow, ESCROW_STATES.Emergency);
    });

    it("Should reject emergency with wrong panic code", async function () {
      await expect(
        escrow.connect(buyer).emergencyStop("wrong-code")
      ).to.be.revertedWithCustomError(escrow, "InvalidPanicCode");
    });

    it("Should only allow buyer to activate emergency", async function () {
      await expect(
        escrow.connect(seller).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");

      await expect(
        escrow.connect(attacker).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should verify panic code correctly", async function () {
      // Escrow is already funded from beforeEach
      expect(
        await escrow.verifyEmergencyHash(setup.config.panicCode)
      ).to.be.true;
      
      expect(
        await escrow.verifyEmergencyHash("wrong-code")
      ).to.be.false;
    });

    it("Should prevent normal operations during emergency", async function () {
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      // Should not allow confirm receipt during emergency
      await expect(
        escrow.connect(seller).confirmReceipt()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      
      // Should not allow fund release during emergency
      await setup.timeTravel(50 * TIME.HOUR); // Way past any lock
      await expect(
        escrow.releaseFunds()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("Dispute Functionality", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should allow buyer to raise dispute", async function () {
      const reason = "Goods not as described";
      
      const tx = await escrow.connect(buyer).raiseDispute(reason);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "DisputeRaised", {
        disputant: buyer.address,
        reason: reason
      });
      
      // Verify state changed event emitted
      setup.expectEvent(receipt, "StateChanged");
      
      await setup.assertEscrowState(escrow, ESCROW_STATES.Disputed);
    });

    it("Should allow seller to raise dispute", async function () {
      const reason = "Buyer payment disputed";
      
      await escrow.connect(seller).raiseDispute(reason);
      await setup.assertEscrowState(escrow, ESCROW_STATES.Disputed);
    });

    it("Should not allow non-parties to raise dispute", async function () {
      await expect(
        escrow.connect(attacker).raiseDispute("Fake dispute")
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should extend time-lock when dispute is raised", async function () {
      await escrow.connect(seller).confirmReceipt(); // Lock first
      const lockTimeBefore = await escrow.getTimeLockRemaining();
      
      await escrow.connect(buyer).raiseDispute("Test dispute");
      
      const lockTimeAfter = await escrow.getTimeLockRemaining();
      expect(lockTimeAfter > lockTimeBefore).to.be.true;
    });

    it("Should get dispute information", async function () {
      const reason = "Test dispute reason";
      await escrow.connect(buyer).raiseDispute(reason);
      
      const disputeInfo = await escrow.getDisputeInfo();
      expect(disputeInfo.disputant).to.equal(buyer.address);
      expect(disputeInfo.reason).to.equal(reason);
      expect(disputeInfo.resolved).to.be.false;
      expect(disputeInfo.raisedAt).to.be.gt(0);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const result = await setup.createAndFundEscrow();
      escrow = result.escrow;
    });

    it("Should return correct escrow information", async function () {
      const info = await escrow.getEscrowInfo();
      
      expect(info.seller).to.equal(seller.address);
      expect(info.buyer).to.equal(buyer.address);
      expect(info.amount).to.equal(setup.config.defaultAmount);
      expect(info.state).to.equal(ESCROW_STATES.Funded);
      expect(info.emergencyActive).to.be.false;
      expect(info.createdAt).to.be.gt(0);
      expect(info.updatedAt).to.be.gt(0);
    });

    it("Should calculate time-lock remaining correctly", async function () {
      // Before locking, should return 0
      expect(await escrow.getTimeLockRemaining()).to.equal(0);
      
      // After locking, should return time remaining
      await escrow.connect(seller).confirmReceipt();
      const remaining = await escrow.getTimeLockRemaining();
      expect(remaining).to.be.gt(23 * TIME.HOUR);
      expect(remaining).to.be.lte(25 * TIME.HOUR);
      
      // After time passes, should decrease
      await setup.timeTravel(TIME.HOUR);
      const newRemaining = await escrow.getTimeLockRemaining();
      expect(newRemaining).to.be.lt(remaining);
    });

    it("Should handle emergency data", async function () {
      // Before emergency, should return empty data
      const emptyData = await escrow.getEmergencyData();
      expect(emptyData.activator).to.equal(ethers.ZeroAddress);
      
      // After emergency, should return correct data
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      const emergencyData = await escrow.getEmergencyData();
      expect(emergencyData.activator).to.equal(buyer.address);
      expect(emergencyData.activatedAt).to.be.gt(0);
      expect(emergencyData.lockExtension).to.be.gt(0);
    });
  });
});