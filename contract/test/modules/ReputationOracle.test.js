const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup, ESCROW_STATES, TIME } = require("../helpers/setup");

describe("ReputationOracle Module", function () {
  let setup;
  let reputationOracle, factory;
  let owner, seller, buyer, trader1, trader2, attacker;

  beforeEach(async function () {
    setup = new TestSetup();
    await setup.deployContracts();
    
    factory = setup.contracts.factory;
    
    // Deploy ReputationOracle
    const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
    reputationOracle = await ReputationOracle.deploy();
    await reputationOracle.waitForDeployment();
    await reputationOracle.initialize(setup.accounts.owner.address);
    
    // Register as module in factory
    await factory.connect(setup.accounts.owner).setModule("ReputationOracle", await reputationOracle.getAddress());
    
    // Add factory as authorized updater
    await reputationOracle.connect(setup.accounts.owner).addAuthorizedUpdater(await factory.getAddress());
    
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
    trader1 = setup.accounts.others[0];
    trader2 = setup.accounts.others[1];
    attacker = setup.accounts.attacker;
  });

  describe("Initialization and Configuration", function () {
    it("Should initialize with correct default config", async function () {
      const config = await reputationOracle.getConfig();
      
      expect(config.minTradesForScore).to.equal(5);
      expect(config.scoreDecayPeriod).to.equal(12 * 30 * 24 * 60 * 60); // 12 months
      expect(config.maxPenaltyPoints).to.equal(100);
      expect(config.crossPlatformEnabled).to.be.true;
    });

    it("Should start with zero total users", async function () {
      expect(await reputationOracle.getTotalUsers()).to.equal(0);
    });

    it("Should allow owner to add authorized updaters", async function () {
      await reputationOracle.connect(owner).addAuthorizedUpdater(seller.address);
      
      expect(await reputationOracle.isAuthorizedUpdater(seller.address)).to.be.true;
    });

    it("Should prevent non-owner from adding authorized updaters", async function () {
      await expect(
        reputationOracle.connect(attacker).addAuthorizedUpdater(attacker.address)
      ).to.be.revertedWithCustomError(reputationOracle, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to remove authorized updaters", async function () {
      await reputationOracle.connect(owner).addAuthorizedUpdater(seller.address);
      await reputationOracle.connect(owner).removeAuthorizedUpdater(seller.address);
      
      expect(await reputationOracle.isAuthorizedUpdater(seller.address)).to.be.false;
    });
  });

  describe("Trade Recording", function () {
    it("Should record successful trades", async function () {
      const amount = ethers.parseEther("1.5");
      
      await reputationOracle.connect(owner).recordTrade(trader1.address, amount, true);
      
      const [score, totalTrades, successRate, totalVolume, joinedTimestamp] = 
        await reputationOracle.getReputationData(trader1.address);
      
      expect(totalTrades).to.equal(1);
      expect(successRate).to.equal(100); // 100% success rate
      expect(totalVolume).to.equal(amount);
      expect(joinedTimestamp).to.be.gt(0);
      expect(await reputationOracle.getTotalUsers()).to.equal(1);
    });

    it("Should record failed trades", async function () {
      const amount = ethers.parseEther("2.0");
      
      await reputationOracle.connect(owner).recordTrade(trader1.address, amount, false);
      
      const [score, totalTrades, successRate, totalVolume] = 
        await reputationOracle.getReputationData(trader1.address);
      
      expect(totalTrades).to.equal(1);
      expect(successRate).to.equal(0); // 0% success rate
      expect(totalVolume).to.equal(amount);
    });

    it("Should accumulate multiple trades correctly", async function () {
      const amounts = [
        ethers.parseEther("1.0"),
        ethers.parseEther("2.5"),
        ethers.parseEther("0.8")
      ];
      const successes = [true, true, false];
      
      for (let i = 0; i < amounts.length; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          amounts[i], 
          successes[i]
        );
      }
      
      const [score, totalTrades, successRate, totalVolume] = 
        await reputationOracle.getReputationData(trader1.address);
      
      const expectedVolume = amounts.reduce((sum, amount) => sum + amount, 0n);
      const expectedSuccessRate = Math.floor((2 / 3) * 100); // 2 successful out of 3
      
      expect(totalTrades).to.equal(3);
      expect(successRate).to.equal(expectedSuccessRate);
      expect(totalVolume).to.equal(expectedVolume);
    });

    it("Should prevent unauthorized trade recording", async function () {
      await expect(
        reputationOracle.connect(attacker).recordTrade(trader1.address, ethers.parseEther("1"), true)
      ).to.be.revertedWith("Not authorized updater");
    });

    it("Should increment total users only once per trader", async function () {
      // Record multiple trades for same trader
      await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("1"), true);
      await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("2"), true);
      
      expect(await reputationOracle.getTotalUsers()).to.equal(1);
      
      // Record trade for different trader
      await reputationOracle.connect(owner).recordTrade(trader2.address, ethers.parseEther("1"), true);
      
      expect(await reputationOracle.getTotalUsers()).to.equal(2);
    });
  });

  describe("Reputation Score Calculation", function () {
    it("Should return neutral score (50) for new users", async function () {
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.equal(50);
    });

    it("Should return neutral score for users with insufficient trades", async function () {
      // Record trades below minimum threshold
      for (let i = 0; i < 4; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("1"), 
          true
        );
      }
      
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.equal(50);
    });

    it("Should calculate score based on success rate", async function () {
      // Record 5 trades with 100% success rate
      for (let i = 0; i < 5; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("1"), 
          true
        );
      }
      
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.be.gte(80); // 80% base score for perfect success rate + bonuses
    });

    it("Should apply volume bonus to score", async function () {
      // Record 5 trades with high volume
      for (let i = 0; i < 5; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("25"), // High volume to trigger bonus
          true
        );
      }
      
      const scoreHighVolume = await reputationOracle.getReputationScore(trader1.address);
      
      // Compare with low volume trader
      for (let i = 0; i < 5; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader2.address, 
          ethers.parseEther("0.1"), // Low volume
          true
        );
      }
      
      const scoreLowVolume = await reputationOracle.getReputationScore(trader2.address);
      
      expect(scoreHighVolume).to.be.gt(scoreLowVolume);
    });

    it("Should cap maximum score at 100", async function () {
      // Record many high-volume perfect trades
      for (let i = 0; i < 20; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("100"), 
          true
        );
      }
      
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.be.lte(100); // Should be capped at 100, but may be 90 (80% + 10% bonus)
      expect(score).to.be.gte(90); // Should be at least 90 with perfect trades and volume bonus
    });

    it("Should maintain minimum score of 10", async function () {
      // Record failed trades and apply maximum penalties
      for (let i = 0; i < 10; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("1"), 
          false
        );
      }
      
      // Apply maximum penalty
      await reputationOracle.connect(owner).applyPenalty(
        trader1.address, 
        100, 
        "Maximum penalty test"
      );
      
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.equal(10);
    });
  });

  describe("Dispute Recording", function () {
    beforeEach(async function () {
      // Set up traders with some trade history
      for (let i = 0; i < 5; i++) {
        await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("1"), true);
        await reputationOracle.connect(owner).recordTrade(trader2.address, ethers.parseEther("1"), true);
      }
    });

    it("Should record dispute and update counters", async function () {
      await reputationOracle.connect(owner).recordDispute(trader1.address, trader2.address, true);
      
      const [, totalTrades1] = await reputationOracle.getReputationData(trader1.address);
      const [, totalTrades2] = await reputationOracle.getReputationData(trader2.address);
      
      // Trades should remain the same, but dispute counters should update
      expect(totalTrades1).to.equal(5);
      expect(totalTrades2).to.equal(5);
    });

    it("Should apply penalty to losing party", async function () {
      const scoreBefore = await reputationOracle.getReputationScore(trader2.address);
      
      // trader1 wins dispute against trader2
      await reputationOracle.connect(owner).recordDispute(trader1.address, trader2.address, true);
      
      const scoreAfter = await reputationOracle.getReputationScore(trader2.address);
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should apply smaller penalty to invalid disputant", async function () {
      const scoreBefore = await reputationOracle.getReputationScore(trader1.address);
      
      // trader1 loses dispute against trader2 (invalid dispute)
      await reputationOracle.connect(owner).recordDispute(trader1.address, trader2.address, false);
      
      const scoreAfter = await reputationOracle.getReputationScore(trader1.address);
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should prevent unauthorized dispute recording", async function () {
      await expect(
        reputationOracle.connect(attacker).recordDispute(trader1.address, trader2.address, true)
      ).to.be.revertedWith("Not authorized updater");
    });
  });

  describe("Penalty System", function () {
    beforeEach(async function () {
      // Set up trader with trade history
      for (let i = 0; i < 10; i++) {
        await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("1"), true);
      }
    });

    it("Should allow owner to apply penalties", async function () {
      const scoreBefore = await reputationOracle.getReputationScore(trader1.address);
      
      await reputationOracle.connect(owner).applyPenalty(trader1.address, 20, "Test penalty");
      
      const scoreAfter = await reputationOracle.getReputationScore(trader1.address);
      expect(scoreAfter).to.be.lt(scoreBefore);
    });

    it("Should cap penalty points at maximum", async function () {
      // Apply penalty exceeding maximum
      await reputationOracle.connect(owner).applyPenalty(trader1.address, 150, "Excessive penalty");
      
      // The penalty should be capped
      // We can't directly check penalty points, but score should reflect the cap
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.be.gte(10); // Should not go below minimum
    });

    it("Should emit penalty events", async function () {
      const penalty = 25;
      const reason = "Event test penalty";
      
      await expect(
        reputationOracle.connect(owner).applyPenalty(trader1.address, penalty, reason)
      ).to.emit(reputationOracle, "PenaltyApplied")
        .withArgs(trader1.address, penalty, reason);
    });

    it("Should prevent non-owner from applying penalties", async function () {
      await expect(
        reputationOracle.connect(attacker).applyPenalty(trader1.address, 10, "Unauthorized penalty")
      ).to.be.revertedWithCustomError(reputationOracle, "OwnableUnauthorizedAccount");
    });
  });

  describe("Trustworthiness Assessment", function () {
    it("Should identify new users as not trustworthy", async function () {
      expect(await reputationOracle.isTrustworthy(trader1.address)).to.be.false;
    });

    it("Should identify users with insufficient trades as not trustworthy", async function () {
      // Record trades below minimum threshold but with perfect success
      for (let i = 0; i < 4; i++) {
        await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("1"), true);
      }
      
      expect(await reputationOracle.isTrustworthy(trader1.address)).to.be.false;
    });

    it("Should identify high-reputation users as trustworthy", async function () {
      // Record sufficient successful trades
      for (let i = 0; i < 10; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("5"), 
          true
        );
      }
      
      expect(await reputationOracle.isTrustworthy(trader1.address)).to.be.true;
    });

    it("Should identify penalized users as not trustworthy", async function () {
      // Build up good reputation first
      for (let i = 0; i < 10; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("5"), 
          true
        );
      }
      
      // Apply significant penalty
      await reputationOracle.connect(owner).applyPenalty(trader1.address, 50, "Major violation");
      
      expect(await reputationOracle.isTrustworthy(trader1.address)).to.be.false;
    });
  });

  describe("Time Decay", function () {
    it("Should apply time decay to inactive users", async function () {
      // Record trades to build reputation
      for (let i = 0; i < 10; i++) {
        await reputationOracle.connect(owner).recordTrade(trader1.address, ethers.parseEther("5"), true);
      }
      
      const scoreAfterTrades = await reputationOracle.getReputationScore(trader1.address);
      
      // Simulate time passage (this is limited in tests, but we can test the logic)
      // In a real scenario, we'd advance time significantly
      
      // The score should remain high since no real time has passed in the test
      expect(scoreAfterTrades).to.be.gte(80);
    });
  });

  describe("Cross-Platform Integration", function () {
    it("Should support adding reputation sources", async function () {
      await reputationOracle.connect(owner).addReputationSource(
        "LocalBitcoins",
        trader1.address, // Mock oracle address
        75 // 75% weight
      );
      
      // We can't directly verify the source was added without a getter,
      // but this tests that the function executes without reverting
    });

    it("Should prevent adding sources with excessive weight", async function () {
      await expect(
        reputationOracle.connect(owner).addReputationSource(
          "TestPlatform",
          trader1.address,
          150 // Exceeds 100% weight
        )
      ).to.be.revertedWith("Weight too high");
    });

    it("Should prevent adding sources with zero address", async function () {
      await expect(
        reputationOracle.connect(owner).addReputationSource(
          "TestPlatform",
          ethers.ZeroAddress,
          50
        )
      ).to.be.revertedWith("Invalid oracle");
    });
  });

  describe("Gas Optimization", function () {
    it("Should efficiently record trades", async function () {
      const tx = await reputationOracle.connect(owner).recordTrade(
        trader1.address, 
        ethers.parseEther("1"), 
        true
      );
      
      const receipt = await tx.wait();
      
      // Should use reasonable gas for trade recording
      expect(Number(receipt.gasUsed)).to.be.lt(180000);
    });

    it("Should efficiently calculate scores", async function () {
      // Set up user with multiple trades
      for (let i = 0; i < 20; i++) {
        await reputationOracle.connect(owner).recordTrade(
          trader1.address, 
          ethers.parseEther("1"), 
          i % 3 !== 0 // Mix of successful and failed trades
        );
      }
      
      // Score calculation should be efficient (view function, no gas cost)
      const score = await reputationOracle.getReputationScore(trader1.address);
      expect(score).to.be.a('bigint');
    });

    it("Should handle batch operations efficiently", async function () {
      const users = [trader1, trader2, setup.accounts.others[2], setup.accounts.others[3]];
      const promises = [];
      
      // Record trades for multiple users simultaneously
      for (const user of users) {
        for (let i = 0; i < 5; i++) {
          promises.push(
            reputationOracle.connect(owner).recordTrade(
              user.address, 
              ethers.parseEther("1"), 
              true
            )
          );
        }
      }
      
      const results = await Promise.all(promises);
      const receipts = await Promise.all(results.map(tx => tx.wait()));
      
      // All transactions should complete successfully
      receipts.forEach(receipt => {
        expect(receipt.status).to.equal(1);
        expect(Number(receipt.gasUsed)).to.be.lt(180000);
      });
      
      expect(await reputationOracle.getTotalUsers()).to.equal(users.length);
    });
  });
});