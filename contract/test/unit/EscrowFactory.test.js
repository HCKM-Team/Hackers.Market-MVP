const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { TestSetup, ERRORS } = require("../helpers/setup");

describe("EscrowFactory", function () {
  let setup;
  let factory, timeLock, emergency;
  let owner, seller, buyer, attacker;

  beforeEach(async function () {
    setup = new TestSetup();
    const contracts = await setup.deployContracts();
    const accounts = setup.accounts;
    
    factory = contracts.factory;
    timeLock = contracts.timeLock;
    emergency = contracts.emergency;
    
    owner = accounts.owner;
    seller = accounts.seller;
    buyer = accounts.buyer;
    attacker = accounts.attacker;
  });

  describe("Deployment", function () {
    it("Should deploy with correct initial values", async function () {
      expect(await factory.owner()).to.equal(owner.address);
      expect(await factory.getCreationFee()).to.equal(setup.config.creationFee);
      expect(await factory.getTotalEscrows()).to.equal(0);
      expect(await factory.isPaused()).to.equal(false);
      expect(await factory.version()).to.equal("1.1.0");
    });

    it("Should have modules registered", async function () {
      expect(await factory.getModule("TimeLock")).to.equal(await timeLock.getAddress());
      expect(await factory.getModule("Emergency")).to.equal(await emergency.getAddress());
    });

    it("Should not allow zero address implementation", async function () {
      const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
      
      await expect(
        upgrades.deployProxy(EscrowFactory, [
          ethers.ZeroAddress,
          owner.address
        ])
      ).to.be.reverted;
    });
  });

  describe("Escrow Creation", function () {
    it("Should create escrow with correct fee", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("trade-001")
      };

      const tx = await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      
      // Check event emission
      const event = setup.expectEvent(receipt, "EscrowCreated", {
        seller: seller.address,
        buyer: buyer.address,
        tradeId: params.tradeId,
        amount: params.amount
      });

      // Check escrow exists
      const escrowAddress = event.args.escrow;
      expect(await factory.escrowExists(escrowAddress)).to.be.true;
      
      // Check escrow is in seller's list
      const sellerEscrows = await factory.getSellerEscrows(seller.address);
      expect(sellerEscrows).to.include(escrowAddress);
      
      // Check total count
      expect(await factory.getTotalEscrows()).to.equal(1);
      expect(await factory.getSellerEscrowCount(seller.address)).to.equal(1);
      
      // Check trade ID mapping
      expect(await factory.getEscrowByTradeId(params.tradeId)).to.equal(escrowAddress);
    });

    it("Should revert with insufficient fee", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("trade-002")
      };

      await expect(
        factory.connect(seller).createEscrow(params, { 
          value: setup.config.creationFee - 1n 
        })
      ).to.be.revertedWithCustomError(factory, "InsufficientFee");
    });

    it("Should revert with invalid parameters", async function () {
      const baseParams = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("trade-003")
      };

      // Zero buyer address
      await expect(
        factory.connect(seller).createEscrow({
          ...baseParams,
          buyer: ethers.ZeroAddress
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "InvalidBuyer");

      // Seller as buyer
      await expect(
        factory.connect(seller).createEscrow({
          ...baseParams,
          buyer: seller.address
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "InvalidBuyer");

      // Zero amount
      await expect(
        factory.connect(seller).createEscrow({
          ...baseParams,
          amount: 0
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "InvalidAmount");

      // Empty description
      await expect(
        factory.connect(seller).createEscrow({
          ...baseParams,
          description: ""
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "InvalidDescription");

      // Zero trade ID
      await expect(
        factory.connect(seller).createEscrow({
          ...baseParams,
          tradeId: ethers.ZeroHash
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "InvalidDescription");
    });

    it("Should prevent duplicate trade IDs", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("trade-duplicate")
      };

      // First creation should succeed
      await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });

      // Second creation with same trade ID should fail
      await expect(
        factory.connect(seller).createEscrow(params, { 
          value: setup.config.creationFee 
        })
      ).to.be.revertedWithCustomError(factory, "EscrowAlreadyExists");
    });

    it("Should accumulate fees correctly", async function () {
      const initialFees = await factory.getAccumulatedFees();
      
      await factory.connect(seller).createEscrow({
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "Test trade",
        customTimeLock: 0,
        tradeId: ethers.id("fee-test")
      }, { value: setup.config.creationFee });

      const finalFees = await factory.getAccumulatedFees();
      expect(finalFees - initialFees).to.equal(setup.config.creationFee);
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow owner to pause and unpause", async function () {
      // Initially not paused
      expect(await factory.isPaused()).to.be.false;

      // Pause
      const pauseTx = await factory.connect(owner).pause();
      await setup.expectEvent(await pauseTx.wait(), "FactoryPaused", {
        admin: owner.address
      });
      expect(await factory.isPaused()).to.be.true;

      // Unpause
      const unpauseTx = await factory.connect(owner).unpause();
      await setup.expectEvent(await unpauseTx.wait(), "FactoryUnpaused", {
        admin: owner.address
      });
      expect(await factory.isPaused()).to.be.false;
    });

    it("Should prevent escrow creation when paused", async function () {
      await factory.connect(owner).pause();

      await expect(
        factory.connect(seller).createEscrow({
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: "Test trade",
          customTimeLock: 0,
          tradeId: ethers.id("paused-test")
        }, { value: setup.config.creationFee })
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(
        factory.connect(attacker).pause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Fee Management", function () {
    beforeEach(async function () {
      // Create some escrows to accumulate fees
      for (let i = 0; i < 3; i++) {
        await factory.connect(seller).createEscrow({
          buyer: buyer.address,
          amount: ethers.parseEther("1"),
          description: `Test trade ${i}`,
          customTimeLock: 0,
          tradeId: ethers.id(`fee-mgmt-${i}`)
        }, { value: setup.config.creationFee });
      }
    });

    it("Should allow owner to update creation fee", async function () {
      const newFee = ethers.parseEther("0.001");
      
      const tx = await factory.connect(owner).updateCreationFee(newFee);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "CreationFeeUpdated", {
        oldFee: setup.config.creationFee,
        newFee: newFee
      });
      
      expect(await factory.getCreationFee()).to.equal(newFee);
    });

    it("Should allow owner to withdraw fees", async function () {
      const totalFees = await factory.getAccumulatedFees();
      const recipient = setup.accounts.others[0];
      
      const balanceBefore = await ethers.provider.getBalance(recipient.address);
      
      const tx = await factory.connect(owner).withdrawFees(recipient.address, totalFees);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "FeesWithdrawn", {
        recipient: recipient.address,
        amount: totalFees
      });
      
      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(totalFees);
      
      expect(await factory.getAccumulatedFees()).to.equal(0);
    });

    it("Should not allow withdrawal of more than accumulated", async function () {
      const totalFees = await factory.getAccumulatedFees();
      const excessAmount = totalFees + ethers.parseEther("1");
      
      await expect(
        factory.connect(owner).withdrawFees(owner.address, excessAmount)
      ).to.be.revertedWithCustomError(factory, "InvalidAmount");
    });

    it("Should not allow non-owner fee management", async function () {
      await expect(
        factory.connect(attacker).updateCreationFee(ethers.parseEther("0.001"))
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");

      await expect(
        factory.connect(attacker).withdrawFees(attacker.address, 1000)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Module Management", function () {
    it("Should allow owner to update modules", async function () {
      const newModule = setup.accounts.others[0].address;
      
      const tx = await factory.connect(owner).setModule("TestModule", newModule);
      const receipt = await tx.wait();
      
      setup.expectEvent(receipt, "ModuleUpdated", {
        moduleName: "TestModule",
        oldModule: ethers.ZeroAddress,
        newModule: newModule
      });
      
      expect(await factory.getModule("TestModule")).to.equal(newModule);
    });

    it("Should not allow non-owner to update modules", async function () {
      await expect(
        factory.connect(attacker).setModule("TestModule", attacker.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should validate module parameters", async function () {
      await expect(
        factory.connect(owner).setModule("", await timeLock.getAddress())
      ).to.be.revertedWithCustomError(factory, "InvalidDescription");

      await expect(
        factory.connect(owner).setModule("TestModule", ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidAmount");
    });
  });

  describe("View Functions", function () {
    let escrowAddress;
    
    beforeEach(async function () {
      const { escrowAddress: addr } = await setup.createEscrow();
      escrowAddress = addr;
    });

    it("Should return correct escrow information", async function () {
      const escrowInfo = await factory.getEscrowInfo(escrowAddress);
      
      expect(escrowInfo.seller).to.equal(seller.address);
      expect(escrowInfo.buyer).to.equal(buyer.address);
      expect(escrowInfo.amount).to.equal(setup.config.defaultAmount);
      expect(escrowInfo.state).to.equal(0); // Created
    });

    it("Should revert for non-existent escrow", async function () {
      const fakeAddress = setup.accounts.others[0].address;
      
      await expect(
        factory.getEscrowInfo(fakeAddress)
      ).to.be.revertedWithCustomError(factory, "EscrowNotFound");
    });

    it("Should return empty arrays for new sellers", async function () {
      const newSeller = setup.accounts.others[1];
      const escrows = await factory.getSellerEscrows(newSeller.address);
      
      expect(escrows.length).to.equal(0);
      expect(await factory.getSellerEscrowCount(newSeller.address)).to.equal(0);
    });
  });
});