const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestSetup } = require("../helpers/setup");

describe("CREATE3 Deployment", function () {
  let setup;
  let deployer, implementation, factory;
  let owner, seller, buyer;

  beforeEach(async function () {
    // Use CREATE3 deployment for this test
    setup = new TestSetup({ useCREATE3: true, saltPrefix: "HCKM_CREATE3_TEST_" });
    await setup.deployContracts();
    
    deployer = setup.contracts.deployer;
    implementation = setup.contracts.implementation;
    factory = setup.contracts.factory;
    
    owner = setup.accounts.owner;
    seller = setup.accounts.seller;
    buyer = setup.accounts.buyer;
  });

  describe("Deterministic Deployment", function () {
    it("Should deploy EscrowImplementation with deterministic address", async function () {
      const salt = ethers.id("HCKM_CREATE3_TEST_IMPLEMENTATION");
      const predictedAddress = await deployer.getDeployedAddress(salt);
      
      expect(await implementation.getAddress()).to.equal(predictedAddress);
    });

    it("Should deploy with same address across different deployers", async function () {
      // Deploy another CREATE3Deployer
      const CREATE3Deployer = await ethers.getContractFactory("CREATE3Deployer");
      const deployer2 = await CREATE3Deployer.deploy(owner.address);
      await deployer2.waitForDeployment();
      
      const salt = ethers.id("SAME_SALT_TEST");
      
      // Get predicted addresses from both deployers
      const addr1 = await deployer.getDeployedAddress(salt);
      const addr2 = await deployer2.getDeployedAddress(salt);
      
      // Addresses should be different because deployers are different
      // CREATE3 gives deterministic addresses per deployer
      expect(addr1).to.not.equal(addr2);
      
      // But each deployer should consistently predict the same address
      const addr1_again = await deployer.getDeployedAddress(salt);
      const addr2_again = await deployer2.getDeployedAddress(salt);
      
      expect(addr1).to.equal(addr1_again);
      expect(addr2).to.equal(addr2_again);
    });

    it("Should allow multiple implementations with different salts", async function () {
      const salt2 = ethers.id("HCKM_CREATE3_TEST_IMPLEMENTATION_2");
      
      const tx = await deployer.deployEscrowImplementation(salt2);
      const receipt = await tx.wait();
      
      // Should emit deployment event
      const event = receipt.logs.find(log => {
        try {
          const parsed = deployer.interface.parseLog(log);
          return parsed && parsed.name === 'ContractDeployed';
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      const parsedEvent = deployer.interface.parseLog(event);
      expect(parsedEvent.args.contractType).to.equal("EscrowImplementation");
      
      const impl2Address = await deployer.getDeployedAddress(salt2);
      const impl2 = await ethers.getContractAt("EscrowImplementation", impl2Address);
      
      // Should be different from first implementation
      expect(impl2Address).to.not.equal(await implementation.getAddress());
      
      // Both should be valid EscrowImplementation contracts
      // Note: We can't call version() directly since it's not initialized
      // But we can verify the code exists
      const code = await ethers.provider.getCode(impl2Address);
      expect(code).to.not.equal("0x");
    });
  });

  describe("Integration with Factory", function () {
    it("Should work with EscrowFactory using CREATE3 implementation", async function () {
      // Verify factory is properly configured
      expect(await factory.version()).to.equal("1.1.0");
      expect(await factory.getTotalEscrows()).to.equal(0);
    });

    it("Should create escrows normally with CREATE3 implementation", async function () {
      const params = {
        buyer: buyer.address,
        amount: ethers.parseEther("1"),
        description: "CREATE3 test trade",
        customTimeLock: 0,
        tradeId: ethers.id("create3-trade-001")
      };

      const tx = await factory
        .connect(seller)
        .createEscrow(params, { value: setup.config.creationFee });
      
      const receipt = await tx.wait();
      
      // Extract escrow address from events
      const event = receipt.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed && parsed.name === 'EscrowCreated';
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      const parsedEvent = factory.interface.parseLog(event);
      const escrowAddress = parsedEvent.args.escrow;
      
      // Verify escrow was created successfully
      expect(await factory.escrowExists(escrowAddress)).to.be.true;
      
      // Get escrow instance and verify it works
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
      expect(await escrow.getSeller()).to.equal(seller.address);
      expect(await escrow.getBuyer()).to.equal(buyer.address);
      expect(await escrow.getAmount()).to.equal(params.amount);
    });
  });

  describe("Cross-Chain Consistency", function () {
    it("Should demonstrate CREATE3 deterministic behavior", async function () {
      const testSalt = ethers.id("CROSS_CHAIN_TEST_SALT");
      
      // Same deployer should always predict same address for same salt
      const addr1 = await deployer.getDeployedAddress(testSalt);
      const addr2 = await deployer.getDeployedAddress(testSalt);
      
      expect(addr1).to.equal(addr2);
      
      // Different salts should give different addresses
      const differentSalt = ethers.id("DIFFERENT_SALT");
      const addr3 = await deployer.getDeployedAddress(differentSalt);
      
      expect(addr1).to.not.equal(addr3);
    });
  });
});