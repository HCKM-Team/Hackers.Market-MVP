const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME } = require("../helpers/setup");

describe("Edge Cases and Stress Tests", function () {
  let setup;
  let factory, timeLock, emergency;
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

  describe("Extreme Value Testing", function () {
    it("Should handle minimum possible trade amounts", async function () {
      const minAmount = 1n; // 1 wei
      
      const params = {
        buyer: buyer.address,
        amount: minAmount,
        description: "Minimum amount test",
        customTimeLock: 0,
        tradeId: ethers.id("min-amount-test")
      };

      const tx = await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      const event = setup.expectEvent(receipt, "EscrowCreated");
      const escrowAddress = event.args.escrow;
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);

      // Should fund with exact minimum amount
      await escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, { value: minAmount });
      expect(await escrow.getBalance()).to.equal(minAmount);

      // Complete the trade
      await escrow.connect(seller).confirmReceipt();
      await setup.timeTravel(25 * TIME.HOUR);
      
      const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
      await escrow.releaseFunds();
      const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
      
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(minAmount);
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Released);
    });

    it("Should handle very large trade amounts", async function () {
      // Use a large but realistic amount for testing
      const largeAmount = ethers.parseEther("1000"); // 1000 ETH
      
      // Fund the buyer account for this test
      await owner.sendTransaction({
        to: buyer.address,
        value: largeAmount + ethers.parseEther("1") // Extra for gas
      });

      const params = {
        buyer: buyer.address,
        amount: largeAmount,
        description: "Large amount test",
        customTimeLock: 0,
        tradeId: ethers.id("large-amount-test")
      };

      const tx = await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      const event = setup.expectEvent(receipt, "EscrowCreated");
      const escrowAddress = event.args.escrow;
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);

      await escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, { value: largeAmount });
      expect(await escrow.getBalance()).to.equal(largeAmount);

      // Should still work with normal flow
      await escrow.connect(seller).confirmReceipt();
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Locked);
    });

    it("Should handle extreme time-lock durations", async function () {
      const minDuration = 1; // 1 second
      const maxDuration = 365 * 24 * 60 * 60; // 1 year in seconds

      // Test minimum duration
      const result1 = await setup.createEscrow({
        customTimeLock: minDuration,
        description: "Min timelock test",
        tradeId: ethers.id("min-timelock-test")
      });
      await setup.fundEscrow(result1.escrow);
      await result1.escrow.connect(seller).confirmReceipt();

      const info1 = await result1.escrow.getEscrowInfo();
      const currentTime = await setup.getLatestTimestamp();
      const actualDuration1 = Number(info1.timeLockEnd) - currentTime;
      expect(actualDuration1).to.be.closeTo(minDuration, 5);

      // Test maximum duration
      const result2 = await setup.createEscrow({
        customTimeLock: maxDuration,
        description: "Max timelock test",
        tradeId: ethers.id("max-timelock-test")
      });
      await setup.fundEscrow(result2.escrow);
      await result2.escrow.connect(seller).confirmReceipt();

      const info2 = await result2.escrow.getEscrowInfo();
      const currentTime2 = await setup.getLatestTimestamp();
      const actualDuration2 = Number(info2.timeLockEnd) - currentTime2;
      expect(actualDuration2).to.be.closeTo(maxDuration, 5);
    });
  });

  describe("Boundary Condition Testing", function () {
    it("Should handle time-lock expiry at exact boundary", async function () {
      const { escrow } = await setup.createAndFundEscrow();
      
      // Confirm receipt to start time-lock
      await escrow.connect(seller).confirmReceipt();
      
      const escrowInfo = await escrow.getEscrowInfo();
      const timeLockEnd = Number(escrowInfo.timeLockEnd);
      const currentTime = await setup.getLatestTimestamp();
      const timeToWait = timeLockEnd - currentTime;
      
      // Try to release funds just before expiry (should fail)
      await setup.timeTravel(timeToWait - 2); // 2 seconds before expiry
      await expect(
        escrow.releaseFunds()
      ).to.be.revertedWithCustomError(escrow, "TimeLockActive");
      
      // Time travel to just after expiry
      await setup.timeTravel(5); // 3 seconds past expiry
      
      // Should now work
      await escrow.releaseFunds();
      await setup.assertEscrowState(escrow, ESCROW_STATES.Released);
    });

    it("Should handle state transitions at exact timing boundaries", async function () {
      const { escrow } = await setup.createAndFundEscrow();
      
      // Attempt emergency and confirmation in same block (if possible)
      // This tests race conditions and state consistency
      
      const confirmTx = escrow.connect(seller).confirmReceipt();
      const emergencyTx = escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      // One should succeed, one should fail with InvalidState
      try {
        await confirmTx;
        // If confirm succeeded, emergency should fail
        await expect(emergencyTx).to.be.revertedWithCustomError(escrow, "InvalidState");
        expect(await escrow.getState()).to.equal(ESCROW_STATES.Locked);
      } catch (error) {
        // If confirm failed, emergency might have succeeded
        await emergencyTx;
        expect(await escrow.getState()).to.equal(ESCROW_STATES.Emergency);
      }
    });

    it("Should handle maximum string lengths", async function () {
      // Test very long description (near gas limit)
      const maxDescription = "A".repeat(10000); // Very long description
      
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: maxDescription,
        customTimeLock: 0,
        tradeId: ethers.id("max-string-test")
      };

      // Should succeed or fail gracefully due to gas limits
      try {
        const tx = await factory
          .connect(seller)
          .createEscrow(params, { value: setup.config.creationFee });
        await tx.wait();
        
        // If it succeeds, verify the description was stored
        const escrowAddress = (await factory.getSellerEscrows(seller.address))[0];
        const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
        const storedInfo = await escrow.getEscrowInfo();
        expect(storedInfo.description).to.equal(maxDescription);
      } catch (error) {
        // If it fails due to gas limit, that's acceptable
        expect(error.message).to.include("gas");
      }
    });
  });

  describe("Concurrent Operations Stress Testing", function () {
    it("Should handle multiple simultaneous escrow creations", async function () {
      const numEscrows = 10;
      const creationPromises = [];
      
      // Create multiple escrows simultaneously
      for (let i = 0; i < numEscrows; i++) {
        const params = {
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Concurrent test ${i}`,
          customTimeLock: 0,
          tradeId: ethers.id(`concurrent-${i}`)
        };
        
        const promise = factory
          .connect(seller)
          .createEscrow(params, { value: setup.config.creationFee });
        
        creationPromises.push(promise);
      }
      
      // Wait for all to complete
      const results = await Promise.allSettled(creationPromises);
      
      // All should succeed (no duplicate trade IDs)
      for (const result of results) {
        expect(result.status).to.equal("fulfilled");
      }
      
      expect(await factory.getTotalEscrows()).to.equal(numEscrows);
    });

    it("Should handle rapid state transitions", async function () {
      const { escrow } = await setup.createEscrow();
      
      // Rapid sequence of operations
      await escrow.connect(buyer).fundEscrow(setup.config.emergencyHash, {
        value: await escrow.getAmount()
      });
      
      await escrow.connect(seller).confirmReceipt();
      
      // Immediately try emergency (should work)
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      expect(await escrow.getState()).to.equal(ESCROW_STATES.Emergency);
    });

    it("Should handle emergency spam protection", async function () {
      const escrows = [];
      
      // Create multiple escrows
      for (let i = 0; i < 5; i++) {
        const result = await setup.createAndFundEscrow({
          description: `Spam test ${i}`,
          tradeId: ethers.id(`spam-test-${i}`)
        });
        escrows.push(result.escrow);
      }
      
      // First emergency should work
      await escrows[0].connect(buyer).emergencyStop(setup.config.panicCode);
      
      // Try subsequent emergencies (may or may not fail depending on implementation)
      for (let i = 1; i < escrows.length; i++) {
        try {
          await escrows[i].connect(buyer).emergencyStop(setup.config.panicCode);
          // If it succeeds, that's fine - no cooldown implemented
        } catch (error) {
          // If it fails with cooldown, that's also fine
          expect(error.message).to.include("Cooldown");
        }
      }
    });
  });

  describe("Gas Limit and Performance Testing", function () {
    it("Should handle escrow creation within reasonable gas limits", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Gas test",
        customTimeLock: 0,
        tradeId: ethers.id("gas-test")
      };

      const tx = await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      
      // Should use reasonable amount of gas (under 500k)
      expect(Number(receipt.gasUsed)).to.be.lt(500000);
    });

    it("Should handle operations efficiently with many existing escrows", async function () {
      // Create many escrows first
      for (let i = 0; i < 50; i++) {
        const params = {
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Performance test ${i}`,
          customTimeLock: 0,
          tradeId: ethers.id(`perf-test-${i}`)
        };
        
        await factory
          .connect(seller)
          .createEscrow(params, { value: setup.config.creationFee });
      }
      
      // Creating one more should still be efficient
      const finalParams = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Final performance test",
        customTimeLock: 0,
        tradeId: ethers.id("final-perf-test")
      };
      
      const tx = await factory
        .connect(seller)
        .createEscrow(finalParams, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      
      // Gas usage should not increase significantly with more escrows
      expect(Number(receipt.gasUsed)).to.be.lt(500000);
    });
  });

  describe("Error Recovery and Resilience", function () {
    it("Should recover gracefully from module failures", async function () {
      // Create and fund escrow with modules available
      const { escrow } = await setup.createAndFundEscrow();
      
      // Confirm receipt to get into locked state
      await escrow.connect(seller).confirmReceipt();
      await setup.assertEscrowState(escrow, ESCROW_STATES.Locked);
      
      // Simulate module failure by removing TimeLock module
      await factory.connect(owner).setModule("TimeLock", ethers.ZeroAddress);
      
      // Create new escrow - should still work with fallback behavior
      const { escrow: newEscrow } = await setup.createAndFundEscrow();
      
      // Should use default time-lock behavior when module unavailable
      await newEscrow.connect(seller).confirmReceipt();
      await setup.assertEscrowState(newEscrow, ESCROW_STATES.Locked);
      
      // Verify fallback duration (24 hours default)
      const escrowInfo = await newEscrow.getEscrowInfo();
      const currentTime = await setup.getLatestTimestamp();
      const actualDuration = Number(escrowInfo.timeLockEnd) - currentTime;
      
      expect(Number(actualDuration)).to.be.closeTo(24 * TIME.HOUR, 5 * 60);
      
      // Emergency should still work without emergency module
      await factory.connect(owner).setModule("Emergency", ethers.ZeroAddress);
      
      const { escrow: emergencyEscrow } = await setup.createAndFundEscrow();
      
      // Emergency stop should work with default behavior
      await emergencyEscrow.connect(buyer).emergencyStop(setup.config.panicCode);
      await setup.assertEscrowState(emergencyEscrow, ESCROW_STATES.Emergency);
      
      // Should use default 48-hour extension
      const emergencyInfo = await emergencyEscrow.getEscrowInfo();
      const emergencyCurrentTime = await setup.getLatestTimestamp();
      const emergencyDuration = Number(emergencyInfo.timeLockEnd) - emergencyCurrentTime;
      
      expect(Number(emergencyDuration)).to.be.closeTo(48 * TIME.HOUR, 5 * 60);
    });

    it("Should handle emergency module unavailability", async function () {
      // Remove emergency module first
      await factory.connect(owner).setModule("Emergency", ethers.ZeroAddress);
      
      // Create and fund escrow without emergency module
      const { escrow } = await setup.createAndFundEscrow();
      
      // Emergency functionality should still work with fallback behavior
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      await setup.assertEscrowState(escrow, ESCROW_STATES.Emergency);
      
      // Should use default emergency extension (48 hours)
      const remaining = await escrow.getTimeLockRemaining();
      expect(Number(remaining)).to.be.closeTo(48 * TIME.HOUR, 5 * 60);
      
      // Emergency should not be tracked in module (module is unavailable)
      // But escrow should still enter emergency state
      const emergencyData = await escrow.getEmergencyData();
      expect(emergencyData.activator).to.equal(buyer.address);
      expect(Number(emergencyData.lockExtension)).to.be.closeTo(48 * TIME.HOUR, 5 * 60);
      
      // Create another escrow to test that emergency works multiple times
      // without module tracking (no cooldown enforcement)
      const { escrow: escrow2 } = await setup.createAndFundEscrow();
      
      // Should work immediately since no module is tracking cooldowns
      await escrow2.connect(buyer).emergencyStop(setup.config.panicCode);
      await setup.assertEscrowState(escrow2, ESCROW_STATES.Emergency);
    });

    it("Should handle network congestion gracefully", async function () {
      // Simulate high gas price environment
      const highGasPrice = ethers.parseUnits("100", "gwei");
      
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "High gas test",
        customTimeLock: 0,
        tradeId: ethers.id("high-gas-test")
      };

      // Should still work with high gas price
      const tx = await factory
        .connect(seller)
        .createEscrow(params, { 
          value: setup.config.creationFee,
          gasPrice: highGasPrice
        });
      
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1); // Success
    });
  });

  describe("Data Consistency Under Stress", function () {
    it("Should maintain accurate counts with many operations", async function () {
      const numOperations = 20;
      
      // Track expected counts
      let expectedTotal = 0;
      let expectedSellerCount = 0;
      
      for (let i = 0; i < numOperations; i++) {
        const params = {
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Consistency test ${i}`,
          customTimeLock: 0,
          tradeId: ethers.id(`consistency-test-${i}`)
        };
        
        await factory
          .connect(seller)
          .createEscrow(params, { value: setup.config.creationFee });
        
        expectedTotal++;
        expectedSellerCount++;
        
        // Verify counts are accurate after each operation
        expect(await factory.getTotalEscrows()).to.equal(expectedTotal);
        expect(await factory.getSellerEscrowCount(seller.address)).to.equal(expectedSellerCount);
      }
      
      // Final verification
      const sellerEscrows = await factory.getSellerEscrows(seller.address);
      expect(sellerEscrows.length).to.equal(expectedSellerCount);
    });

    it("Should maintain state consistency across complex workflows", async function () {
      const { escrow } = await setup.createAndFundEscrow();
      
      // Record initial state
      const initialInfo = await escrow.getEscrowInfo();
      
      // Perform state transition
      await escrow.connect(seller).confirmReceipt();
      
      // Verify state consistency
      const lockedInfo = await escrow.getEscrowInfo();
      expect(lockedInfo.seller).to.equal(initialInfo.seller);
      expect(lockedInfo.buyer).to.equal(initialInfo.buyer);
      expect(lockedInfo.amount).to.equal(initialInfo.amount);
      expect(lockedInfo.description).to.equal(initialInfo.description);
      expect(lockedInfo.createdAt).to.equal(initialInfo.createdAt);
      expect(lockedInfo.updatedAt).to.be.gte(initialInfo.updatedAt);
      expect(lockedInfo.state).to.equal(ESCROW_STATES.Locked);
      
      // Emergency transition
      await escrow.connect(buyer).emergencyStop(setup.config.panicCode);
      
      // Verify emergency state consistency
      const emergencyInfo = await escrow.getEscrowInfo();
      expect(emergencyInfo.emergencyActive).to.be.true;
      expect(emergencyInfo.state).to.equal(ESCROW_STATES.Emergency);
      expect(emergencyInfo.timeLockEnd).to.be.gt(lockedInfo.timeLockEnd);
      
      // Emergency data should be populated
      const emergencyData = await escrow.getEmergencyData();
      expect(emergencyData.activator).to.equal(buyer.address);
      expect(emergencyData.activatedAt).to.be.gt(0);
      expect(emergencyData.lockExtension).to.be.gt(0);
    });
  });
});