#!/bin/bash

# Single network deployment script

set -e

# Check arguments
if [ $# -eq 0 ]; then
    echo "Usage: ./deploy_single.sh <network>"
    echo "Available networks: sepolia, baseSepolia, etherlinkTestnet"
    exit 1
fi

NETWORK=$1

echo "========================================="
echo "Deploying HCKM to $NETWORK"
echo "========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Deploy CREATE3
echo "Step 1: Deploying CREATE3 factory..."
npx hardhat run scripts/01_deploy_create3.ts --network $NETWORK

# Deploy contracts
echo ""
echo "Step 2: Deploying main contracts..."
npx hardhat run scripts/02_deploy_contracts.ts --network $NETWORK

# Verify
echo ""
echo "Step 3: Verifying deployment..."
npx hardhat run scripts/03_verify_deployment.ts --network $NETWORK

echo ""
echo "✅ Deployment complete!"