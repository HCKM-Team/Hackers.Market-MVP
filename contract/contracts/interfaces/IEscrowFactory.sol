// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEscrowStructs.sol";

/**
 * @title IEscrowFactory
 * @dev Interface for the HCKM (Hackers.Market) upgradeable anti-coercion escrow factory contract
 */
interface IEscrowFactory is IEscrowStructs {
    /**
     * @dev Events
     */
    event EscrowCreated(
        address indexed escrow,
        address indexed seller,
        address indexed buyer,
        bytes32 tradeId,
        uint256 amount
    );

    event EscrowImplementationUpdated(
        address indexed oldImplementation,
        address indexed newImplementation
    );

    event ModuleUpdated(
        string moduleName,
        address indexed oldModule,
        address indexed newModule
    );

    event FactoryPaused(address indexed admin);
    event FactoryUnpaused(address indexed admin);
    event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed recipient, uint256 amount);

    /**
     * @dev Errors
     */
    error InvalidBuyer();
    error InvalidAmount();
    error InvalidDescription();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error FactoryAlreadyPaused();
    error UnauthorizedSeller();
    error ModuleNotSet();
    error InvalidContract();
    error InitializationFailed();
    error InsufficientFee();
    error TransferFailed();

    /**
     * @dev Create a new escrow contract (requires payment of creation fee)
     * @param params Escrow creation parameters
     * @return escrowAddress Address of the created escrow contract
     */
    function createEscrow(CreateEscrowParams calldata params) 
        external 
        payable
        returns (address escrowAddress);

    /**
     * @dev Get all escrow contracts created by a seller
     * @param seller Seller's address
     * @return escrows Array of escrow contract addresses
     */
    function getSellerEscrows(address seller) 
        external 
        view 
        returns (address[] memory escrows);

    /**
     * @dev Get escrow information
     * @param escrow Escrow contract address
     * @return info Complete escrow information
     */
    function getEscrowInfo(address escrow) 
        external 
        view 
        returns (EscrowInfo memory info);

    /**
     * @dev Check if an escrow contract exists
     * @param escrow Escrow contract address
     * @return exists True if escrow exists
     */
    function escrowExists(address escrow) 
        external 
        view 
        returns (bool exists);

    /**
     * @dev Get total number of escrows created by a seller
     * @param seller Seller's address
     * @return count Number of escrows
     */
    function getSellerEscrowCount(address seller) 
        external 
        view 
        returns (uint256 count);

    /**
     * @dev Get current escrow implementation address
     * @return implementation Current implementation address
     */
    function getEscrowImplementation() 
        external 
        view 
        returns (address implementation);

    /**
     * @dev Get module address by name
     * @param moduleName Name of the module
     * @return moduleAddress Address of the module
     */
    function getModule(string calldata moduleName) 
        external 
        view 
        returns (address moduleAddress);

    /**
     * @dev Check if factory is paused
     * @return paused True if factory is paused
     */
    function isPaused() 
        external 
        view 
        returns (bool);

    /**
     * @dev Get total number of escrows created
     * @return total Total escrow count
     */
    function getTotalEscrows() external view returns (uint256 total);

    /**
     * @dev Get escrow address by trade ID
     * @param tradeId Trade identifier
     * @return escrow Escrow contract address
     */
    function getEscrowByTradeId(bytes32 tradeId) external view returns (address escrow);

    /**
     * @dev Get implementation version
     * @return version Current version string
     */
    function version() external pure returns (string memory);

    /**
     * @dev Get current creation fee
     * @return fee Creation fee in wei
     */
    function getCreationFee() external view returns (uint256 fee);

    /**
     * @dev Get accumulated fees
     * @return balance Total fees collected
     */
    function getAccumulatedFees() external view returns (uint256 balance);

    // === ADMIN FUNCTIONS ===

    /**
     * @dev Update escrow implementation (owner only)
     * @param newImplementation New implementation address
     */
    function updateEscrowImplementation(address newImplementation) external;

    /**
     * @dev Set or update a module address (owner only)
     * @param moduleName Name of the module
     * @param moduleAddress Address of the module
     */
    function setModule(string calldata moduleName, address moduleAddress) external;

    /**
     * @dev Pause the factory (owner only)
     */
    function pause() external;

    /**
     * @dev Unpause the factory (owner only)
     */
    function unpause() external;

    /**
     * @dev Update creation fee (owner only)
     * @param newFee New creation fee in wei
     */
    function updateCreationFee(uint256 newFee) external;

    /**
     * @dev Withdraw accumulated fees (owner only)
     * @param recipient Address to receive fees
     * @param amount Amount to withdraw
     */
    function withdrawFees(address recipient, uint256 amount) external;
}