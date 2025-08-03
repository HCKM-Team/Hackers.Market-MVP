// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "solady/src/utils/CREATE3.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/EscrowImplementation.sol";

/**
 * @title CREATE3Deployer
 * @dev Deterministic contract deployment using CREATE3 for consistent addresses across chains
 * This deployer focuses on implementation contracts and non-proxy contracts
 */
contract CREATE3Deployer is Ownable {
    event ContractDeployed(
        bytes32 indexed salt,
        address indexed deployed,
        address indexed deployer,
        string contractType
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Deploy a contract using CREATE3 with deterministic address
     * @param salt Unique salt for deterministic address generation
     * @param creationCode Contract creation bytecode with constructor parameters
     * @param contractType Human readable contract type for events
     * @return deployed The address of the deployed contract
     */
    function deploy(
        bytes32 salt, 
        bytes memory creationCode,
        string memory contractType
    ) external onlyOwner returns (address deployed) {
        deployed = CREATE3.deployDeterministic(0, creationCode, salt);
        
        emit ContractDeployed(salt, deployed, msg.sender, contractType);
        return deployed;
    }

    /**
     * @dev Get the deterministic address for a given salt
     * @param salt The salt used for address generation
     * @return The predicted contract address
     */
    function getDeployedAddress(bytes32 salt) external view returns (address) {
        return CREATE3.predictDeterministicAddress(salt, address(this));
    }

    /**
     * @dev Deploy EscrowImplementation with CREATE3 (used as implementation for proxies)
     * @param salt Unique salt for deployment
     * @return implementationAddress The deployed implementation address
     */
    function deployEscrowImplementation(bytes32 salt) 
        external 
        onlyOwner 
        returns (address implementationAddress) 
    {
        // EscrowImplementation is deployed without constructor parameters
        // It will be initialized through the proxy
        bytes memory creationCode = type(EscrowImplementation).creationCode;
        
        implementationAddress = CREATE3.deployDeterministic(0, creationCode, salt);
        
        emit ContractDeployed(salt, implementationAddress, msg.sender, "EscrowImplementation");
        return implementationAddress;
    }

    /**
     * @dev Get the address where a deployer would be deployed with given salt
     * @param salt Unique salt for deployment
     * @param deployer Address that would deploy the contract
     * @return The predicted deployer address
     */
    function predictDeployerAddress(bytes32 salt, address deployer) 
        external 
        pure 
        returns (address) 
    {
        return CREATE3.predictDeterministicAddress(salt, deployer);
    }
}