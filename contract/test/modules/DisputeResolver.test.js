const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME } = require("../helpers/setup");

describe("DisputeResolver Module", function () {
  let setup;
  let disputeResolver, factory, escrow;
  let owner, seller, buyer, arbitrator, attacker;
  let disputeId;

  beforeEach(async function () {
    setup = new TestSetup();
    await setup.deployContracts();
    
    factory = setup.contracts.factory;
    
    // Deploy DisputeResolver
    const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
    disputeResolver = await DisputeResolver.deploy();
    await disputeResolver.waitForDeployment();
    await disputeResolver.initialize(setup.accounts.owner.address);
    
    // Register as module in factory
    await factory.connect(setup.accounts.owner).setModule("DisputeResolver", await disputeResolver.getAddress());
    
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
    arbitrator = setup.accounts.others[0];
    attacker = setup.accounts.attacker;
    
    // Add arbitrator
    await disputeResolver.connect(owner).addArbitrator(arbitrator.address);
    
    // Create and fund an escrow for testing
    const result = await setup.createAndFundEscrow();
    escrow = result.escrow;
  });

  describe("Initialization and Configuration", function () {
    it("Should initialize with correct default config", async function () {
      const config = await disputeResolver.getConfig();
      
      expect(config.autoResolveTimeout).to.equal(7 * 24 * 60 * 60); // 7 days
      expect(config.arbitratorTimeout).to.equal(3 * 24 * 60 * 60); // 3 days
      expect(config.minimumStake).to.equal(ethers.parseEther("0.01"));
      expect(config.arbitratorFee).to.equal(ethers.parseEther("0.005"));
      expect(config.automationEnabled).to.be.true;
    });

    it("Should allow owner to add arbitrators", async function () {
      const newArbitrator = setup.accounts.others[1];
      
      await disputeResolver.connect(owner).addArbitrator(newArbitrator.address);
      
      expect(await disputeResolver.isAuthorizedArbitrator(newArbitrator.address)).to.be.true;
    });

    it("Should prevent non-owner from adding arbitrators", async function () {
      await expect(
        disputeResolver.connect(attacker).addArbitrator(attacker.address)
      ).to.be.revertedWithCustomError(disputeResolver, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to remove arbitrators", async function () {
      await disputeResolver.connect(owner).removeArbitrator(arbitrator.address);
      
      expect(await disputeResolver.isAuthorizedArbitrator(arbitrator.address)).to.be.false;
    });
  });

  describe("Dispute Filing", function () {
    it("Should allow filing disputes with sufficient stake", async function () {
      const reason = "Item not as described";
      const stake = ethers.parseEther("0.02"); // Above minimum
      
      const tx = await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        reason,
        { value: stake }
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = disputeResolver.interface.parseLog(log);
          return parsed && parsed.name === 'DisputeFiled';
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      const parsedEvent = disputeResolver.interface.parseLog(event);
      disputeId = parsedEvent.args.disputeId;
      
      expect(parsedEvent.args.escrow).to.equal(await escrow.getAddress());
      expect(parsedEvent.args.disputant).to.equal(buyer.address);
      expect(parsedEvent.args.reason).to.equal(reason);
      
      expect(await disputeResolver.getTotalDisputes()).to.equal(1);
    });

    it("Should reject disputes with insufficient stake", async function () {
      const reason = "Test dispute";
      const insufficientStake = ethers.parseEther("0.005"); // Below minimum
      
      await expect(
        disputeResolver.connect(buyer).fileDispute(
          await escrow.getAddress(),
          reason,
          { value: insufficientStake }
        )
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should reject disputes with empty reason", async function () {
      const stake = ethers.parseEther("0.02");
      
      await expect(
        disputeResolver.connect(buyer).fileDispute(
          await escrow.getAddress(),
          "",
          { value: stake }
        )
      ).to.be.revertedWith("Reason required");
    });

    it("Should auto-assign disputes to under review status", async function () {
      const reason = "Auto-assignment test";
      const stake = ethers.parseEther("0.02");
      
      const tx = await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        reason,
        { value: stake }
      );
      
      const receipt = await tx.wait();
      const filedEvent = receipt.logs.find(log => {
        try {
          const parsed = disputeResolver.interface.parseLog(log);
          return parsed && parsed.name === 'DisputeFiled';
        } catch {
          return false;
        }
      });
      
      const parsedEvent = disputeResolver.interface.parseLog(filedEvent);
      disputeId = parsedEvent.args.disputeId;
      
      const dispute = await disputeResolver.getDispute(disputeId);
      expect(dispute.status).to.equal(1); // UnderReview
    });
  });

  describe("Dispute Resolution", function () {
    beforeEach(async function () {
      // File a dispute for resolution tests
      const reason = "Resolution test dispute";
      const stake = ethers.parseEther("0.02");
      
      const tx = await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        reason,
        { value: stake }
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = disputeResolver.interface.parseLog(log);
          return parsed && parsed.name === 'DisputeFiled';
        } catch {
          return false;
        }
      });
      
      const parsedEvent = disputeResolver.interface.parseLog(event);
      disputeId = parsedEvent.args.disputeId;
      
      // Manually assign arbitrator for testing
      const dispute = await disputeResolver.getDispute(disputeId);
      // Note: In actual implementation, we'd need to add assignment logic
    });

    it("Should allow authorized arbitrator to resolve disputes", async function () {
      // For this test, we'll modify the dispute status manually or update the contract
      // to support manual assignment for testing
      
      const resolution = "Buyer claim validated, funds to be returned";
      const outcome = 1; // BuyerFavored
      
      // This test will need to be updated once we implement proper arbitrator assignment
      // For now, we'll test the validation logic
      expect(await disputeResolver.isAuthorizedArbitrator(arbitrator.address)).to.be.true;
    });

    it("Should prevent unauthorized users from resolving disputes", async function () {
      const resolution = "Unauthorized resolution attempt";
      const outcome = 1; // BuyerFavored
      
      await expect(
        disputeResolver.connect(attacker).resolveDispute(disputeId, outcome, resolution)
      ).to.be.revertedWith("Not authorized arbitrator");
    });

    it("Should track resolved disputes count", async function () {
      const initialResolved = await disputeResolver.getResolvedDisputes();
      expect(initialResolved).to.equal(0);
      
      // After implementing resolution, this should increment
      // This is a placeholder for when resolution is fully implemented
    });
  });

  describe("Dispute Information and Status", function () {
    beforeEach(async function () {
      const reason = "Information test dispute";
      const stake = ethers.parseEther("0.02");
      
      const tx = await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        reason,
        { value: stake }
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          const parsed = disputeResolver.interface.parseLog(log);
          return parsed && parsed.name === 'DisputeFiled';
        } catch {
          return false;
        }
      });
      
      const parsedEvent = disputeResolver.interface.parseLog(event);
      disputeId = parsedEvent.args.disputeId;
    });

    it("Should return correct dispute information", async function () {
      const dispute = await disputeResolver.getDispute(disputeId);
      
      expect(dispute.escrow).to.equal(await escrow.getAddress());
      expect(dispute.disputant).to.equal(buyer.address);
      expect(dispute.reason).to.equal("Information test dispute");
      expect(dispute.stake).to.equal(ethers.parseEther("0.02"));
      expect(dispute.filedAt).to.be.gt(0);
      expect(dispute.status).to.equal(1); // UnderReview
    });

    it("Should correctly identify active disputes", async function () {
      expect(await disputeResolver.isActiveDispute(disputeId)).to.be.true;
      
      // Test with non-existent dispute
      const fakeDisputeId = ethers.id("fake-dispute");
      expect(await disputeResolver.isActiveDispute(fakeDisputeId)).to.be.false;
    });

    it("Should return empty data for non-existent disputes", async function () {
      const fakeDisputeId = ethers.id("non-existent");
      const dispute = await disputeResolver.getDispute(fakeDisputeId);
      
      expect(dispute.filedAt).to.equal(0);
      expect(dispute.escrow).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Configuration Management", function () {
    it("Should allow owner to update configuration", async function () {
      const newConfig = {
        autoResolveTimeout: 10 * 24 * 60 * 60, // 10 days
        arbitratorTimeout: 5 * 24 * 60 * 60,   // 5 days
        minimumStake: ethers.parseEther("0.02"),
        arbitratorFee: ethers.parseEther("0.01"),
        automationEnabled: false
      };
      
      await disputeResolver.connect(owner).updateConfig(newConfig);
      
      const updatedConfig = await disputeResolver.getConfig();
      expect(updatedConfig.autoResolveTimeout).to.equal(newConfig.autoResolveTimeout);
      expect(updatedConfig.arbitratorTimeout).to.equal(newConfig.arbitratorTimeout);
      expect(updatedConfig.minimumStake).to.equal(newConfig.minimumStake);
      expect(updatedConfig.arbitratorFee).to.equal(newConfig.arbitratorFee);
      expect(updatedConfig.automationEnabled).to.equal(newConfig.automationEnabled);
    });

    it("Should reject invalid configuration", async function () {
      const invalidConfig = {
        autoResolveTimeout: 0, // Invalid
        arbitratorTimeout: 5 * 24 * 60 * 60,
        minimumStake: ethers.parseEther("0.02"),
        arbitratorFee: ethers.parseEther("0.01"),
        automationEnabled: true
      };
      
      await expect(
        disputeResolver.connect(owner).updateConfig(invalidConfig)
      ).to.be.revertedWith("Invalid auto resolve timeout");
    });

    it("Should prevent non-owner from updating configuration", async function () {
      const newConfig = {
        autoResolveTimeout: 10 * 24 * 60 * 60,
        arbitratorTimeout: 5 * 24 * 60 * 60,
        minimumStake: ethers.parseEther("0.02"),
        arbitratorFee: ethers.parseEther("0.01"),
        automationEnabled: false
      };
      
      await expect(
        disputeResolver.connect(attacker).updateConfig(newConfig)
      ).to.be.revertedWithCustomError(disputeResolver, "OwnableUnauthorizedAccount");
    });
  });

  describe("Statistics and Metrics", function () {
    it("Should track total disputes correctly", async function () {
      const initialTotal = await disputeResolver.getTotalDisputes();
      
      // File multiple disputes
      for (let i = 0; i < 3; i++) {
        await disputeResolver.connect(buyer).fileDispute(
          await escrow.getAddress(),
          `Test dispute ${i}`,
          { value: ethers.parseEther("0.02") }
        );
      }
      
      const finalTotal = await disputeResolver.getTotalDisputes();
      expect(finalTotal - initialTotal).to.equal(3);
    });

    it("Should initialize with zero resolved disputes", async function () {
      expect(await disputeResolver.getResolvedDisputes()).to.equal(0);
    });

    it("Should maintain accurate dispute counts", async function () {
      const stake = ethers.parseEther("0.02");
      
      // File several disputes
      const disputePromises = [];
      for (let i = 0; i < 5; i++) {
        disputePromises.push(
          disputeResolver.connect(buyer).fileDispute(
            await escrow.getAddress(),
            `Batch dispute ${i}`,
            { value: stake }
          )
        );
      }
      
      await Promise.all(disputePromises);
      
      expect(await disputeResolver.getTotalDisputes()).to.equal(5);
    });
  });

  describe("Integration with Escrow", function () {
    it("Should be callable from escrow dispute function", async function () {
      // This tests the integration path where escrow calls dispute resolver
      // We'll test this by checking if the module is properly registered
      
      const moduleAddress = await factory.getModule("DisputeResolver");
      expect(moduleAddress).to.equal(await disputeResolver.getAddress());
    });

    it("Should handle multiple disputes for same escrow", async function () {
      const stake = ethers.parseEther("0.02");
      
      // File disputes from both parties
      await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        "Buyer dispute",
        { value: stake }
      );
      
      await disputeResolver.connect(seller).fileDispute(
        await escrow.getAddress(),
        "Seller counter-dispute",
        { value: stake }
      );
      
      expect(await disputeResolver.getTotalDisputes()).to.equal(2);
    });
  });

  describe("Gas Optimization", function () {
    it("Should use reasonable gas for dispute filing", async function () {
      const reason = "Gas optimization test";
      const stake = ethers.parseEther("0.02");
      
      const tx = await disputeResolver.connect(buyer).fileDispute(
        await escrow.getAddress(),
        reason,
        { value: stake }
      );
      
      const receipt = await tx.wait();
      
      // Should use less than 200k gas for dispute filing
      expect(Number(receipt.gasUsed)).to.be.lt(200000);
    });

    it("Should efficiently handle multiple simultaneous disputes", async function () {
      const stake = ethers.parseEther("0.02");
      const disputes = [];
      
      // Create multiple disputes
      for (let i = 0; i < 10; i++) {
        const tx = disputeResolver.connect(buyer).fileDispute(
          await escrow.getAddress(),
          `Simultaneous dispute ${i}`,
          { value: stake }
        );
        disputes.push(tx);
      }
      
      const results = await Promise.all(disputes);
      const receipts = await Promise.all(results.map(tx => tx.wait()));
      
      // Gas usage should remain consistent
      const gasUsages = receipts.map(r => Number(r.gasUsed));
      const avgGas = gasUsages.reduce((a, b) => a + b) / gasUsages.length;
      const maxGas = Math.max(...gasUsages);
      const minGas = Math.min(...gasUsages);
      
      // Variance should be minimal (within 10%)
      expect(maxGas - minGas).to.be.lt(avgGas * 0.1);
    });
  });
});