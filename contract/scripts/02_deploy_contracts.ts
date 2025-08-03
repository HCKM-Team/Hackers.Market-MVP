import { ethers, network, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Deployment configuration
const DEPLOYMENT_CONFIG = {
  // Salt for deterministic deployment (same salt = same address across chains)
  SALT: ethers.id("HCKM_V1_20250803_Unite_Defi"),
  
  // Default configuration values
  CREATION_FEE: ethers.parseEther("0.001"), // 0.001 ETH
  
  // Module configuration
  TIMELOCK_CONFIG: {
    minDuration: 1 * 60 * 60,        // 1 hour
    maxDuration: 7 * 24 * 60 * 60,   // 7 days
    defaultDuration: 24 * 60 * 60,   // 24 hours
    emergencyExtension: 48 * 60 * 60, // 48 hours
    disputeExtension: 72 * 60 * 60   // 72 hours
  },
  
  EMERGENCY_CONFIG: {
    responseTime: 30 * 60,            // 30 minutes
    cooldownPeriod: 1 * 60 * 60,     // 1 hour
    maxActivations: 3,                // 3 per day
    autoLockEnabled: true,
    lockExtension: 48 * 60 * 60      // 48 hours
  }
};

async function main() {
  console.log(`\n========================================`);
  console.log(`Deploying HCKM Contracts on ${network.name}`);
  console.log(`========================================\n`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Load CREATE3 Deployer address
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  let create3Address: string;
  
  try {
    const existingDeployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    create3Address = existingDeployment.CREATE3Deployer;
    console.log("Using existing CREATE3Deployer at:", create3Address);
  } catch {
    throw new Error("CREATE3Deployer not found. Run 01_deploy_create3.ts first!");
  }

  const create3Deployer = await ethers.getContractAt("CREATE3Deployer", create3Address);

  console.log("\n=== Phase 1: Deploy Core Implementation ===");
  
  // 1. Deploy EscrowImplementation using CREATE3 for deterministic address
  console.log("\n1. Deploying EscrowImplementation...");
  const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
  const implBytecode = EscrowImplementation.bytecode;
  
  const implSalt = ethers.keccak256(ethers.toUtf8Bytes("EscrowImplementation" + DEPLOYMENT_CONFIG.SALT));
  const predictedImplAddress = await create3Deployer.getDeployedAddress(implSalt);
  console.log("Predicted EscrowImplementation address:", predictedImplAddress);
  
  const implTx = await create3Deployer.deploy(implSalt, implBytecode, "EscrowImplementation");
  await implTx.wait();
  console.log("✅ EscrowImplementation deployed at:", predictedImplAddress);

  console.log("\n=== Phase 2: Deploy Modules ===");
  
  // 2. Deploy TimeLockModule (upgradeable)
  console.log("\n2. Deploying TimeLockModule...");
  const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
  const timeLockModule = await upgrades.deployProxy(
    TimeLockModule,
    [deployer.address],
    { initializer: "initialize" }
  );
  await timeLockModule.waitForDeployment();
  const timeLockAddress = await timeLockModule.getAddress();
  console.log("✅ TimeLockModule deployed at:", timeLockAddress);

  // Configure TimeLock
  console.log("   Configuring TimeLockModule...");
  await timeLockModule.updateConfig(DEPLOYMENT_CONFIG.TIMELOCK_CONFIG);
  console.log("   ✅ TimeLock configured");

  // 3. Deploy EmergencyModule (upgradeable)
  console.log("\n3. Deploying EmergencyModule...");
  const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
  const emergencyModule = await upgrades.deployProxy(
    EmergencyModule,
    [deployer.address],
    { initializer: "initialize" }
  );
  await emergencyModule.waitForDeployment();
  const emergencyAddress = await emergencyModule.getAddress();
  console.log("✅ EmergencyModule deployed at:", emergencyAddress);

  // Configure Emergency
  console.log("   Configuring EmergencyModule...");
  await emergencyModule.updateConfig(DEPLOYMENT_CONFIG.EMERGENCY_CONFIG);
  
  // Add security contact (you can change this)
  const securityAddress = process.env.SECURITY_TEAM_ADDRESS || deployer.address;
  await emergencyModule.addSecurityContact(securityAddress);
  console.log("   ✅ Emergency configured with security contact:", securityAddress);

  // 4. Deploy DisputeResolver (upgradeable)
  console.log("\n4. Deploying DisputeResolver...");
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await upgrades.deployProxy(
    DisputeResolver,
    [deployer.address],
    { initializer: "initialize" }
  );
  await disputeResolver.waitForDeployment();
  const disputeAddress = await disputeResolver.getAddress();
  console.log("✅ DisputeResolver deployed at:", disputeAddress);

  // 5. Deploy ReputationOracle (upgradeable)
  console.log("\n5. Deploying ReputationOracle...");
  const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
  const reputationOracle = await upgrades.deployProxy(
    ReputationOracle,
    [deployer.address],
    { initializer: "initialize" }
  );
  await reputationOracle.waitForDeployment();
  const reputationAddress = await reputationOracle.getAddress();
  console.log("✅ ReputationOracle deployed at:", reputationAddress);

  console.log("\n=== Phase 3: Deploy Factory ===");
  
  // 6. Deploy EscrowFactory using CREATE3 for deterministic address
  console.log("\n6. Deploying EscrowFactory...");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factorySalt = ethers.keccak256(ethers.toUtf8Bytes("EscrowFactory" + DEPLOYMENT_CONFIG.SALT));
  const predictedFactoryAddress = await create3Deployer.getDeployedAddress(factorySalt);
  console.log("Predicted EscrowFactory address:", predictedFactoryAddress);
  
  // Prepare factory constructor arguments
  const factoryInitCode = ethers.concat([
    EscrowFactory.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address"],
      [deployer.address]
    )
  ]);
  
  const factoryTx = await create3Deployer.deploy(factorySalt, factoryInitCode, "EscrowFactory");
  await factoryTx.wait();
  console.log("✅ EscrowFactory deployed at:", predictedFactoryAddress);

  const factory = await ethers.getContractAt("EscrowFactory", predictedFactoryAddress);

  console.log("\n=== Phase 4: Configure Factory ===");
  
  // Initialize factory with implementation and owner
  console.log("\n7. Initializing Factory...");
  await factory.initialize(
    predictedImplAddress,
    deployer.address
  );
  console.log("✅ Factory initialized");
  
  // Update creation fee
  console.log("\n8. Setting Creation Fee...");
  await factory.updateCreationFee(DEPLOYMENT_CONFIG.CREATION_FEE);
  console.log(`✅ Creation fee set to ${ethers.formatEther(DEPLOYMENT_CONFIG.CREATION_FEE)} ETH`);

  // Set modules
  console.log("\n9. Configuring Factory Modules...");
  await factory.setModule("TimeLock", timeLockAddress);
  console.log("   ✅ TimeLock module set");
  
  await factory.setModule("Emergency", emergencyAddress);
  console.log("   ✅ Emergency module set");
  
  await factory.setModule("DisputeResolver", disputeAddress);
  console.log("   ✅ DisputeResolver module set");
  
  await factory.setModule("ReputationOracle", reputationAddress);
  console.log("   ✅ ReputationOracle module set");

  console.log("\n=== Phase 5: Module Authorization ===");
  
  // Authorize factory to call modules
  console.log("\n10. Setting Module Authorizations...");
  await timeLockModule.setAuthorizedCaller(predictedFactoryAddress, true);
  console.log("   ✅ Factory authorized for TimeLock");
  
  await emergencyModule.setAuthorizedCaller(predictedFactoryAddress, true);
  await emergencyModule.setFactory(predictedFactoryAddress);
  console.log("   ✅ Factory authorized for Emergency");
  
  // DisputeResolver doesn't need explicit authorization for factory
  // It works with arbitrators instead
  console.log("   ✅ DisputeResolver configured (no factory auth needed)");
  
  await reputationOracle.addAuthorizedUpdater(predictedFactoryAddress);
  console.log("   ✅ Factory authorized for ReputationOracle");

  // Also authorize escrow implementation to call modules
  await timeLockModule.setAuthorizedCaller(predictedImplAddress, true);
  await emergencyModule.setAuthorizedCaller(predictedImplAddress, true);
  console.log("   ✅ Escrow implementation authorized for modules");

  console.log("\n=== Deployment Complete ===");
  
  // Save deployment addresses
  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
    deployer: deployer.address,
    contracts: {
      CREATE3Deployer: create3Address,
      EscrowImplementation: predictedImplAddress,
      EscrowFactory: predictedFactoryAddress,
      TimeLockModule: timeLockAddress,
      EmergencyModule: emergencyAddress,
      DisputeResolver: disputeAddress,
      ReputationOracle: reputationAddress,
    },
    configuration: {
      creationFee: DEPLOYMENT_CONFIG.CREATION_FEE.toString(),
      salt: DEPLOYMENT_CONFIG.SALT,
      securityContact: securityAddress,
    }
  };

  // Save deployment to file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deploymentsDir, `${network.name}.json`),
    JSON.stringify(deployment, null, 2)
  );

  console.log("\n========================================");
  console.log("Deployment Summary:");
  console.log(JSON.stringify(deployment, null, 2));
  console.log("========================================\n");
  
  console.log("✅ Deployment saved to:", path.join(deploymentsDir, `${network.name}.json`));

  return deployment;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });