import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";

/**
 * Verify that CREATE3 deployments have the same addresses across all chains
 */
async function main() {
  console.log("\n========================================");
  console.log("Cross-Chain Address Verification");
  console.log("========================================\n");

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  
  // Read all deployment files
  const deploymentFiles = fs.readdirSync(deploymentsDir)
    .filter(file => file.endsWith('.json'));
  
  if (deploymentFiles.length === 0) {
    console.log("No deployments found!");
    return;
  }

  const deployments: any[] = [];
  
  // Load all deployments
  for (const file of deploymentFiles) {
    const deployment = JSON.parse(
      fs.readFileSync(path.join(deploymentsDir, file), 'utf8')
    );
    deployments.push(deployment);
    console.log(`Loaded ${deployment.network} deployment`);
  }

  console.log("\n=== Deterministic Addresses ===\n");

  // Contracts that should have the same address across chains
  const deterministicContracts = [
    "EscrowImplementation",
    "EscrowFactory"
  ];

  for (const contractName of deterministicContracts) {
    console.log(`${contractName}:`);
    
    const addresses = deployments.map(d => ({
      network: d.network,
      address: d.contracts[contractName]
    }));
    
    // Check if all addresses are the same
    const uniqueAddresses = [...new Set(addresses.map(a => a.address.toLowerCase()))];
    
    if (uniqueAddresses.length === 1) {
      console.log(`  ✅ Same address across all chains: ${uniqueAddresses[0]}`);
    } else {
      console.log(`  ❌ Different addresses found:`);
      addresses.forEach(a => {
        console.log(`     ${a.network}: ${a.address}`);
      });
    }
  }

  console.log("\n=== Module Addresses (Chain-Specific) ===\n");

  // Modules are upgradeable and will have different addresses
  const modules = [
    "TimeLockModule",
    "EmergencyModule", 
    "DisputeResolver",
    "ReputationOracle"
  ];

  for (const moduleName of modules) {
    console.log(`${moduleName}:`);
    deployments.forEach(d => {
      console.log(`  ${d.network}: ${d.contracts[moduleName]}`);
    });
  }

  console.log("\n=== Configuration Consistency ===\n");

  // Check configuration consistency
  const configs = deployments.map(d => ({
    network: d.network,
    salt: d.configuration.salt,
    creationFee: d.configuration.creationFee
  }));

  // Check salt consistency
  const salts = [...new Set(configs.map(c => c.salt))];
  if (salts.length === 1) {
    console.log(`✅ Salt consistent: ${salts[0]}`);
  } else {
    console.log("❌ Different salts found:");
    configs.forEach(c => {
      console.log(`   ${c.network}: ${c.salt}`);
    });
  }

  // Check creation fee consistency
  const fees = [...new Set(configs.map(c => c.creationFee))];
  if (fees.length === 1) {
    console.log(`✅ Creation fee consistent: ${ethers.formatEther(fees[0])} ETH`);
  } else {
    console.log("❌ Different creation fees found:");
    configs.forEach(c => {
      console.log(`   ${c.network}: ${ethers.formatEther(c.creationFee)} ETH`);
    });
  }

  console.log("\n=== Summary ===\n");
  console.log(`Total networks deployed: ${deployments.length}`);
  console.log("Networks:", deployments.map(d => d.network).join(", "));
  
  // Generate markdown table for documentation
  console.log("\n=== Deployment Addresses (Markdown) ===\n");
  console.log("| Contract | Address | Networks |");
  console.log("|----------|---------|----------|");
  
  for (const contractName of deterministicContracts) {
    const address = deployments[0].contracts[contractName];
    console.log(`| ${contractName} | \`${address}\` | All |`);
  }
  
  console.log("\n| Module | Sepolia | Base Sepolia | Etherlink |");
  console.log("|--------|---------|--------------|-----------|");
  
  for (const moduleName of modules) {
    const row = [`| ${moduleName} |`];
    
    // Find addresses for each network
    const sepolia = deployments.find(d => d.network === "sepolia");
    const baseSepolia = deployments.find(d => d.network === "baseSepolia");
    const etherlink = deployments.find(d => d.network === "etherlinkTestnet");
    
    row.push(sepolia ? `\`${sepolia.contracts[moduleName]}\` |` : " - |");
    row.push(baseSepolia ? `\`${baseSepolia.contracts[moduleName]}\` |` : " - |");
    row.push(etherlink ? `\`${etherlink.contracts[moduleName]}\` |` : " - |");
    
    console.log(row.join(" "));
  }
}

// Execute verification
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });