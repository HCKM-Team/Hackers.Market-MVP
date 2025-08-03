#!/bin/bash

# HCKM Multi-chain Deployment Script
# Deploys to Base Sepolia, Ethereum Sepolia, and Etherlink Testnet

set -e  # Exit on error

echo "========================================="
echo "HCKM Multi-Chain Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please copy .env.example to .env and configure it with your settings."
    exit 1
fi

# Load environment variables
source .env

# Check required environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: DEPLOYER_PRIVATE_KEY not set in .env${NC}"
    exit 1
fi

# Function to deploy to a network
deploy_to_network() {
    local NETWORK=$1
    echo ""
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}Deploying to $NETWORK${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo ""
    
    # Deploy CREATE3 factory
    echo -e "${GREEN}Step 1: Deploying CREATE3 factory...${NC}"
    npx hardhat run scripts/01_deploy_create3.ts --network $NETWORK
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to deploy CREATE3 factory to $NETWORK${NC}"
        return 1
    fi
    
    # Deploy main contracts
    echo -e "${GREEN}Step 2: Deploying main contracts...${NC}"
    npx hardhat run scripts/02_deploy_contracts.ts --network $NETWORK
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to deploy contracts to $NETWORK${NC}"
        return 1
    fi
    
    # Verify deployment
    echo -e "${GREEN}Step 3: Verifying deployment...${NC}"
    npx hardhat run scripts/03_verify_deployment.ts --network $NETWORK
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Deployment verification failed for $NETWORK${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Successfully deployed to $NETWORK${NC}"
    return 0
}

# Array of networks to deploy to
NETWORKS=("sepolia" "baseSepolia" "etherlinkTestnet")

# Track deployment results
SUCCESSFUL_DEPLOYMENTS=()
FAILED_DEPLOYMENTS=()

# Deploy to each network
for NETWORK in "${NETWORKS[@]}"; do
    if deploy_to_network $NETWORK; then
        SUCCESSFUL_DEPLOYMENTS+=($NETWORK)
    else
        FAILED_DEPLOYMENTS+=($NETWORK)
        echo -e "${YELLOW}Continuing with next network...${NC}"
    fi
done

# Print summary
echo ""
echo "========================================="
echo "Deployment Summary"
echo "========================================="
echo ""

if [ ${#SUCCESSFUL_DEPLOYMENTS[@]} -gt 0 ]; then
    echo -e "${GREEN}Successfully deployed to:${NC}"
    for NETWORK in "${SUCCESSFUL_DEPLOYMENTS[@]}"; do
        echo "  ✅ $NETWORK"
        DEPLOYMENT_FILE="deployments/${NETWORK}.json"
        if [ -f "$DEPLOYMENT_FILE" ]; then
            FACTORY_ADDRESS=$(jq -r '.contracts.EscrowFactory' $DEPLOYMENT_FILE 2>/dev/null || echo "N/A")
            echo "     Factory: $FACTORY_ADDRESS"
        fi
    done
fi

if [ ${#FAILED_DEPLOYMENTS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed deployments:${NC}"
    for NETWORK in "${FAILED_DEPLOYMENTS[@]}"; do
        echo "  ❌ $NETWORK"
    done
fi

# Check if all deployments were successful
if [ ${#FAILED_DEPLOYMENTS[@]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All deployments successful!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Verify contracts on block explorers (if available)"
    echo "2. Test the deployed contracts"
    echo "3. Update frontend with deployment addresses"
    exit 0
else
    echo ""
    echo -e "${YELLOW}⚠️  Some deployments failed. Please check the logs above.${NC}"
    exit 1
fi