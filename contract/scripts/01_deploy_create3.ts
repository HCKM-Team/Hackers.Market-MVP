import { ethers, network } from "hardhat";
import { CREATE3Deployer } from "../typechain-types";

/**
 * Deploy CREATE3 factory on all chains
 * This needs to be deployed once per chain to enable deterministic addresses
 */
async function main() {
  console.log(`\n========================================`);
  console.log(`Deploying CREATE3Deployer on ${network.name}`);
  console.log(`========================================\n`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Deploy CREATE3Deployer
  console.log("\nDeploying CREATE3Deployer...");
  const CREATE3DeployerFactory = await ethers.getContractFactory("CREATE3Deployer");
  const create3Deployer = await CREATE3DeployerFactory.deploy(deployer.address);
  await create3Deployer.waitForDeployment();
  
  const create3Address = await create3Deployer.getAddress();
  console.log("CREATE3Deployer deployed at:", create3Address);

  // Verify the deployment
  console.log("\nVerifying deployment...");
  const deployedCode = await ethers.provider.getCode(create3Address);
  if (deployedCode === "0x") {
    throw new Error("CREATE3Deployer deployment failed - no code at address");
  }
  console.log("✅ CREATE3Deployer verified successfully");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    CREATE3Deployer: create3Address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  console.log("\n========================================");
  console.log("Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  console.log("========================================\n");

  return deploymentInfo;
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });