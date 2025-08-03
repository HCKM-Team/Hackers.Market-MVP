import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log(`\n========================================`);
  console.log(`Verifying HCKM Deployment on ${network.name}`);
  console.log(`========================================\n`);

  // Load deployment
  const deploymentPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found for ${network.name}`);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log("Loaded deployment from:", deploymentPath);
  console.log("Deployment timestamp:", deployment.timestamp);

  const errors: string[] = [];
  let testsRun = 0;
  let testsPassed = 0;

  console.log("\n=== Verifying Contract Deployments ===\n");

  // 1. Verify all contracts have code
  for (const [name, address] of Object.entries(deployment.contracts)) {
    testsRun++;
    process.stdout.write(`Checking ${name}... `);
    const code = await ethers.provider.getCode(address as string);
    if (code === "0x") {
      console.log("❌ No code found!");
      errors.push(`${name} has no code at ${address}`);
    } else {
      console.log("✅");
      testsPassed++;
    }
  }

  console.log("\n=== Verifying Factory Configuration ===\n");

  // 2. Verify factory configuration
  const factory = await ethers.getContractAt("EscrowFactory", deployment.contracts.EscrowFactory);
  
  // Check implementation
  testsRun++;
  process.stdout.write("Checking implementation address... ");
  const impl = await factory.getImplementation();
  if (impl.toLowerCase() !== deployment.contracts.EscrowImplementation.toLowerCase()) {
    console.log("❌");
    errors.push(`Implementation mismatch: ${impl} != ${deployment.contracts.EscrowImplementation}`);
  } else {
    console.log("✅");
    testsPassed++;
  }

  // Check creation fee
  testsRun++;
  process.stdout.write("Checking creation fee... ");
  const fee = await factory.getCreationFee();
  if (fee.toString() !== deployment.configuration.creationFee) {
    console.log("❌");
    errors.push(`Creation fee mismatch: ${fee} != ${deployment.configuration.creationFee}`);
  } else {
    console.log("✅");
    testsPassed++;
  }

  // Check modules
  const modules = [
    { name: "TimeLock", address: deployment.contracts.TimeLockModule },
    { name: "Emergency", address: deployment.contracts.EmergencyModule },
    { name: "DisputeResolver", address: deployment.contracts.DisputeResolver },
    { name: "ReputationOracle", address: deployment.contracts.ReputationOracle },
  ];

  for (const module of modules) {
    testsRun++;
    process.stdout.write(`Checking ${module.name} module... `);
    const moduleAddress = await factory.getModule(module.name);
    if (moduleAddress.toLowerCase() !== module.address.toLowerCase()) {
      console.log("❌");
      errors.push(`${module.name} module mismatch: ${moduleAddress} != ${module.address}`);
    } else {
      console.log("✅");
      testsPassed++;
    }
  }

  console.log("\n=== Verifying Module Authorizations ===\n");

  // 3. Verify TimeLock authorization
  testsRun++;
  process.stdout.write("Checking TimeLock authorization... ");
  const timeLock = await ethers.getContractAt("TimeLockModule", deployment.contracts.TimeLockModule);
  const factoryAuthInTimeLock = await timeLock.isAuthorized(deployment.contracts.EscrowFactory);
  if (!factoryAuthInTimeLock) {
    console.log("❌");
    errors.push("Factory not authorized in TimeLock");
  } else {
    console.log("✅");
    testsPassed++;
  }

  // 4. Verify Emergency authorization
  testsRun++;
  process.stdout.write("Checking Emergency authorization... ");
  const emergency = await ethers.getContractAt("EmergencyModule", deployment.contracts.EmergencyModule);
  const factoryAuthInEmergency = await emergency.isAuthorized(deployment.contracts.EscrowFactory);
  if (!factoryAuthInEmergency) {
    console.log("❌");
    errors.push("Factory not authorized in Emergency");
  } else {
    console.log("✅");
    testsPassed++;
  }

  console.log("\n=== Testing Basic Functionality ===\n");

  // 5. Test escrow creation
  testsRun++;
  process.stdout.write("Testing escrow creation... ");
  const [deployer, seller, buyer] = await ethers.getSigners();
  
  try {
    const params = {
      buyer: buyer.address,
      amount: ethers.parseEther("0.01"),
      description: "Test escrow",
      customTimeLock: 0,
      tradeId: ethers.id("test-" + Date.now())
    };
    
    const tx = await factory.connect(seller).createEscrow(params, {
      value: deployment.configuration.creationFee
    });
    
    const receipt = await tx.wait();
    
    // Find EscrowCreated event
    const event = receipt?.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log as any);
        return parsed?.name === "EscrowCreated";
      } catch {
        return false;
      }
    });
    
    if (event) {
      console.log("✅");
      testsPassed++;
      
      const parsed = factory.interface.parseLog(event as any);
      const escrowAddress = parsed?.args.escrow;
      console.log(`   Created test escrow at: ${escrowAddress}`);
      
      // Verify escrow contract
      testsRun++;
      process.stdout.write("   Verifying escrow contract... ");
      const escrowCode = await ethers.provider.getCode(escrowAddress);
      if (escrowCode !== "0x") {
        console.log("✅");
        testsPassed++;
      } else {
        console.log("❌");
        errors.push("Created escrow has no code");
      }
    } else {
      console.log("❌");
      errors.push("No EscrowCreated event found");
    }
  } catch (error: any) {
    console.log("❌");
    errors.push(`Escrow creation failed: ${error.message}`);
  }

  console.log("\n========================================");
  console.log("Verification Summary");
  console.log("========================================");
  console.log(`Tests run: ${testsRun}`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsRun - testsPassed}`);
  
  if (errors.length > 0) {
    console.log("\nErrors found:");
    errors.forEach(error => console.log(`  - ${error}`));
    console.log("\n❌ Deployment verification FAILED");
    process.exit(1);
  } else {
    console.log("\n✅ Deployment verification PASSED");
  }
}

// Execute verification
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });