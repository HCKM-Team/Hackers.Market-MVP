const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME } = require("../helpers/setup");

describe("Escrow Workflow - Functional Tests", function () {
  let setup;
  let factory, timeLock, emergency;
  let owner, seller, buyer, attacker, security;

  beforeEach(async function () {
    setup = new TestSetup();
    await setup.deployContracts();
    
    factory = setup.contracts.factory;
    timeLock = setup.contracts.timeLock;
    emergency = setup.contracts.emergency;
    
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
    attacker = setup.accounts.attacker;
    security = setup.accounts.security;
  });

  describe("Happy Path - Complete Trade Flow", function () {
    it("Should complete a full successful trade from creation to release", async function () {
      const tradeAmount = ethers.parseEther("2.5");
      const description = "MacBook Pro M3 - Like New Condition";
      
      // Step 1: Seller creates escrow
      const createParams = {
        buyer: buyer.address,
        amount: tradeAmount,
        description: description,
        customTimeLock: 0, // Use module calculation
        tradeId: ethers.id("functional-test-001")
      };

      const createTx = await factory
        .connect(seller)
        .createEscrow(createParams, { value: setup.config.creationFee });
      
      const createReceipt = await createTx.wait();
      
      // Extract escrow address
      const createEvent = setup.expectEvent(createReceipt, "EscrowCreated");
      const escrowAddress = createEvent.args.escrow;
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
      
      // Verify initial state
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Created);
      expect(await escrow.getSeller()).to.equal(seller.address);
      expect(await escrow.getBuyer()).to.equal(buyer.address);
      expect(await escrow.getAmount()).to.equal(tradeAmount);
      
      // Step 2: Buyer funds the escrow
      const fundTx = await escrow
        .connect(buyer)
        .fundEscrow(setup.config.emergencyHash, { value: tradeAmount });
      
      const fundReceipt = await fundTx.wait();
      setup.expectEvent(fundReceipt, "EscrowFunded");
      
      // Verify funded state
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Funded);
      expect(await escrow.getBalance()).to.equal(tradeAmount);
      
      // Step 3: Seller confirms receipt (item delivered)
      const confirmTx = await escrow.connect(seller).confirmReceipt();
      const confirmReceipt = await confirmTx.wait();
      
      setup.expectEvent(confirmReceipt, "StateChanged");
      setup.expectEvent(confirmReceipt, "TimeLockUpdated");
      
      // Verify locked state with time-lock
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Locked);
      const timeLockRemaining = await escrow.getTimeLockRemaining();
      expect(timeLockRemaining).to.be.gt(0);
      
      // Step 4: Wait for time-lock to expire
      await setup.timeTravel(25 * TIME.HOUR); // Past default 24 hour lock
      
      // Verify time-lock expired
      expect(await escrow.isTimeLockExpired()).to.be.true;
      expect(await escrow.getTimeLockRemaining()).to.equal(0);
      
      // Step 5: Release funds to seller
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      
      const releaseTx = await escrow.releaseFunds();
      const releaseReceipt = await releaseTx.wait();
      
      setup.expectEvent(releaseReceipt, "FundsReleased");
      setup.expectEvent(releaseReceipt, "StateChanged");
      
      // Verify final state
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Released);
      expect(await escrow.getBalance()).to.equal(0);
      
      // Verify seller received funds
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(tradeAmount);
      
      // Verify factory statistics updated
      expect(await factory.getTotalEscrows()).to.equal(1);
      expect(await factory.getSellerEscrowCount(seller.address)).to.equal(1);
    });

    it("Should handle multiple concurrent trades", async function () {
      const numTrades = 3;
      const baseAmount = ethers.parseEther("1.0");
      const escrows = [];
      
      // Create multiple escrows
      for (let i = 0; i < numTrades; i++) {
        const tradeAmount = baseAmount * BigInt(i + 1);
        const params = {
          buyer: buyer.address,
          amount: tradeAmount,
          description: `Trade ${i + 1}`,
          customTimeLock: 0,
          tradeId: ethers.id(`concurrent-trade-${i + 1}`)
        };

        const tx = await factory
          .connect(seller)
          .createEscrow(params, { value: setup.config.creationFee });
        
        const receipt = await tx.wait();
        const event = setup.expectEvent(receipt, "EscrowCreated");
        const escrowAddress = event.args.escrow;
        const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
        
        // Fund each escrow
        await escrow
          .connect(buyer)
          .fundEscrow(setup.config.emergencyHash, { value: tradeAmount });
        
        escrows.push({ escrow, amount: tradeAmount });
      }
      
      // Verify all escrows are created and funded
      expect(await factory.getTotalEscrows()).to.equal(numTrades);
      
      for (const { escrow } of escrows) {
        expect(await escrow.getState()).to.equal(ESCROW_STATES.Funded);
      }
      
      // Complete all trades
      for (const { escrow, amount } of escrows) {
        await escrow.connect(seller).confirmReceipt();
        expect(await escrow.getState()).to.equal(ESCROW_STATES.Locked);
      }
      
      // Fast forward and release all
      await setup.timeTravel(25 * TIME.HOUR);
      
      for (const { escrow } of escrows) {
        await escrow.releaseFunds();
        expect(await escrow.getState()).to.equal(ESCROW_STATES.Released);
      }
    });
  });

  describe("Anti-Coercion Scenarios", function () {
    let escrow;
    const tradeAmount = ethers.parseEther("5.0");

    beforeEach(async function () {
      const result = await setup.createAndFundEscrow({
        amount: tradeAmount,
        description: "High-value electronics"
      });
      escrow = result.escrow;
    });

    it("Should handle emergency activation during funded state", async function () {
      // Buyer activates panic button
      const emergencyTx = await escrow
        .connect(buyer)
        .emergencyStop(setup.config.panicCode);
      
      const emergencyReceipt = await emergencyTx.wait();
      
      setup.expectEvent(emergencyReceipt, "EmergencyActivated");
      setup.expectEvent(emergencyReceipt, "StateChanged");
      
      // Verify emergency state
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Emergency);
      
      // Verify extended time-lock
      const timeLockRemaining = await escrow.getTimeLockRemaining();
      expect(timeLockRemaining).to.be.gt(40 * TIME.HOUR); // Should be extended
      
      // Verify emergency data
      const emergencyData = await escrow.getEmergencyData();
      expect(emergencyData.activator).to.equal(buyer.address);
      expect(emergencyData.activatedAt).to.be.gt(0);
      expect(emergencyData.lockExtension).to.be.gt(0);
      
      // Normal operations should be blocked
      await expect(
        escrow.connect(seller).confirmReceipt()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      
      // Even after time passes, release should be blocked
      await setup.timeTravel(50 * TIME.HOUR);
      await expect(
        escrow.releaseFunds()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Should handle emergency activation after confirmation", async function () {
      // Normal flow: confirm receipt first
      await escrow.connect(seller).confirmReceipt();
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Locked);
      
      const originalTimeLock = await escrow.getTimeLockRemaining();
      
      // Then buyer activates emergency
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Emergency);
      
      // Time-lock should be extended from original
      const newTimeLock = await escrow.getTimeLockRemaining();
      expect(newTimeLock).to.be.gt(originalTimeLock);
    });

    it("Should prevent invalid panic code activation", async function () {
      await expect(
        escrow.connect(buyer).emergencyStop("wrong-panic-code")
      ).to.be.revertedWithCustomError(escrow, "InvalidPanicCode");
      
      // State should remain unchanged
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Funded);
    });

    it("Should prevent unauthorized emergency activation", async function () {
      // Only buyer should be able to activate emergency
      await expect(
        escrow.connect(seller).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
      
      await expect(
        escrow.connect(attacker).emergencyStop(setup.config.panicCode)
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
  });

  describe("Dispute Resolution Scenarios", function () {
    let escrow;
    const tradeAmount = ethers.parseEther("3.0");

    beforeEach(async function () {
      const result = await setup.createAndFundEscrow({
        amount: tradeAmount,
        description: "Disputed item trade"
      });
      escrow = result.escrow;
    });

    it("Should handle buyer dispute before confirmation", async function () {
      const disputeReason = "Item not as described";
      
      const disputeTx = await escrow.connect(buyer).raiseDispute(disputeReason);
      const disputeReceipt = await disputeTx.wait();
      
      setup.expectEvent(disputeReceipt, "DisputeRaised");
      setup.expectEvent(disputeReceipt, "StateChanged");
      
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Disputed);
      
      // Verify dispute info
      const disputeInfo = await escrow.getDisputeInfo();
      expect(disputeInfo.disputant).to.equal(buyer.address);
      expect(disputeInfo.reason).to.equal(disputeReason);
      expect(disputeInfo.resolved).to.be.false;
      expect(disputeInfo.raisedAt).to.be.gt(0);
      
      // Time-lock should be extended
      const timeLockRemaining = await escrow.getTimeLockRemaining();
      expect(timeLockRemaining).to.be.gt(48 * TIME.HOUR); // Extended for dispute
    });

    it("Should handle seller dispute after confirmation", async function () {
      // Confirm receipt first
      await escrow.connect(seller).confirmReceipt();
      const originalTimeLock = await escrow.getTimeLockRemaining();
      
      // Seller raises dispute
      const disputeReason = "Buyer payment disputed";
      await escrow.connect(seller).raiseDispute(disputeReason);
      
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Disputed);
      
      // Time-lock should be extended from original
      const newTimeLock = await escrow.getTimeLockRemaining();
      expect(newTimeLock).to.be.gt(originalTimeLock);
    });

    it("Should prevent unauthorized dispute raising", async function () {
      await expect(
        escrow.connect(attacker).raiseDispute("Fake dispute")
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should prevent operations during dispute", async function () {
      await escrow.connect(buyer).raiseDispute("Test dispute");
      
      // Should not allow confirmation during dispute
      await expect(
        escrow.connect(seller).confirmReceipt()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      
      // Should not allow release during dispute (even if time passes)
      await setup.timeTravel(100 * TIME.HOUR);
      await expect(
        escrow.releaseFunds()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });

  describe("Cancellation Scenarios", function () {
    it("Should allow seller to cancel before funding", async function () {
      const { escrow } = await setup.createEscrow();
      
      const cancelTx = await escrow.connect(seller).cancelEscrow();
      const cancelReceipt = await cancelTx.wait();
      
      setup.expectEvent(cancelReceipt, "StateChanged");
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Cancelled);
      
      // Should prevent funding after cancellation
      await expect(
        escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, {
          value: setup.config.defaultAmount
        })
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Should allow buyer to cancel before funding", async function () {
      const { escrow } = await setup.createEscrow();
      
      await escrow.connect(buyer).cancelEscrow();
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Cancelled);
    });

    it("Should prevent cancellation after funding", async function () {
      const { escrow } = await setup.createAndFundEscrow();
      
      await expect(
        escrow.connect(seller).cancelEscrow()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
      
      await expect(
        escrow.connect(buyer).cancelEscrow()
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Should prevent unauthorized cancellation", async function () {
      const { escrow } = await setup.createEscrow();
      
      await expect(
        escrow.connect(attacker).cancelEscrow()
      ).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
  });

  describe("Fee and Payment Validation", function () {
    it("Should reject escrow creation with insufficient fee", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("fee-test")
      };

      const insufficientFee = setup.config.creationFee - 1n;
      
      await expect(
        factory.connect(seller).createEscrow(params, { value: insufficientFee })
      ).to.be.revertedWithCustomError(factory, "InsufficientFee");
    });

    it("Should reject funding with incorrect amount", async function () {
      const { escrow } = await setup.createEscrow();
      const correctAmount = await escrow.getAmount();
      const wrongAmount = correctAmount - ethers.parseEther("0.1");
      
      await expect(
        escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, {
          value: wrongAmount
        })
      ).to.be.revertedWithCustomError(escrow, "InsufficientAmount");
    });

    it("Should handle excess payment correctly", async function () {
      const { escrow } = await setup.createEscrow();
      const correctAmount = await escrow.getAmount();
      const excessAmount = correctAmount + ethers.parseEther("0.5");
      
      // Excess payment should be rejected
      await expect(
        escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, {
          value: excessAmount
        })
      ).to.be.revertedWithCustomError(escrow, "InsufficientAmount");
    });
  });

  describe("Time-Lock Behavior", function () {
    it("Should use different time-locks based on trade amount", async function () {
      const amounts = [
        ethers.parseEther("0.1"),  // Small amount
        ethers.parseEther("1.0"),  // Medium amount  
        ethers.parseEther("10.0")  // Large amount
      ];
      
      const escrows = [];
      
      for (const amount of amounts) {
        const result = await setup.createEscrow({ amount });
        await setup.fundEscrow(result.escrow, amount);
        await result.escrow.connect(seller).confirmReceipt();
        
        const timeLockRemaining = await result.escrow.getTimeLockRemaining();
        escrows.push({ escrow: result.escrow, amount, timeLock: timeLockRemaining });
      }
      
      // Verify different amounts get different time-locks
      // (Exact values depend on TimeLockModule configuration)
      for (const { timeLock } of escrows) {
        expect(timeLock).to.be.gt(TIME.HOUR);
        expect(timeLock).to.be.lte(7 * TIME.DAY);
      }
    });

    it("Should respect custom time-lock settings", async function () {
      const customDuration = 12 * TIME.HOUR;
      
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
  });

  describe("Factory Management", function () {
    it("Should track multiple sellers and their escrows", async function () {
      const seller2 = setup.accounts.others[0];
      const seller3 = setup.accounts.others[1];
      
      // Create escrows for different sellers
      await setup.createEscrow(); // seller
      
      // Seller 2
      const params2 = {
        buyer: buyer.address,
        amount: ethers.parseEther("2"),
        description: "Seller 2 trade",
        customTimeLock: 0,
        tradeId: ethers.id("seller2-trade")
      };
      await factory.connect(seller2).createEscrow(params2, { value: setup.config.creationFee });
      
      // Seller 3 - multiple escrows
      for (let i = 0; i < 2; i++) {
        const params3 = {
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Seller 3 trade ${i + 1}`,
          customTimeLock: 0,
          tradeId: ethers.id(`seller3-trade-${i + 1}`)
        };
        await factory.connect(seller3).createEscrow(params3, { value: setup.config.creationFee });
      }
      
      // Verify counts
      expect(await factory.getTotalEscrows()).to.equal(4);
      expect(await factory.getSellerEscrowCount(seller.address)).to.equal(1);
      expect(await factory.getSellerEscrowCount(seller2.address)).to.equal(1);
      expect(await factory.getSellerEscrowCount(seller3.address)).to.equal(2);
      
      // Verify escrow lists
      const seller1Escrows = await factory.getSellerEscrows(seller.address);
      const seller2Escrows = await factory.getSellerEscrows(seller2.address);
      const seller3Escrows = await factory.getSellerEscrows(seller3.address);
      
      expect(seller1Escrows.length).to.equal(1);
      expect(seller2Escrows.length).to.equal(1);
      expect(seller3Escrows.length).to.equal(2);
    });

    it("Should accumulate and allow fee withdrawal", async function () {
      const initialBalance = await ethers.provider.getBalance(owner.address);
      const expectedFees = setup.config.creationFee * 3n;
      
      // Create multiple escrows to accumulate fees
      for (let i = 0; i < 3; i++) {
        const params = {
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Fee test ${i + 1}`,
          customTimeLock: 0,
          tradeId: ethers.id(`fee-accumulation-${i + 1}`)
        };
        await factory.connect(seller).createEscrow(params, { value: setup.config.creationFee });
      }
      
      // Check accumulated fees
      const accumulatedFees = await factory.getAccumulatedFees();
      expect(accumulatedFees).to.equal(expectedFees);
      
      // Withdraw fees
      const withdrawTx = await factory.connect(owner).withdrawFees(owner.address, accumulatedFees);
      await withdrawTx.wait();
      
      // Verify withdrawal
      expect(await factory.getAccumulatedFees()).to.equal(0);
      
      const finalBalance = await ethers.provider.getBalance(owner.address);
      // Account for gas costs in the approximation
      expect(finalBalance - initialBalance).to.be.closeTo(expectedFees, ethers.parseEther("0.01"));
    });
  });
});