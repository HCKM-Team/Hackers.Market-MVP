// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IEscrowFactory.sol";
import "../interfaces/IEscrow.sol";

/**
 * @title EscrowFactory
 * @dev HCKM (Hackers.Market) upgradeable factory contract for deploying anti-coercion escrow contracts using minimal proxies
 * @dev Implements revolutionary anti-coercion P2P escrow protocol with modular architecture for physical safety
 */
contract EscrowFactory is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable, 
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    IEscrowFactory 
{
    using Clones for address;

    /// @dev Current escrow implementation contract
    address private _escrowImplementation;

    /// @dev Mapping from seller to their escrow contracts
    mapping(address => address[]) private _sellerEscrows;

    /// @dev Mapping to check if an escrow contract exists
    mapping(address => bool) private _escrowExists;

    /// @dev Mapping of module names to their addresses
    mapping(string => address) private _modules;

    /// @dev Mapping from tradeId to escrow address (prevents duplicates)
    mapping(bytes32 => address) private _tradeIdToEscrow;

    /// @dev Total number of escrows created
    uint256 private _totalEscrows;

    /// @dev Creation fee required to deploy new escrow (default: 0.0008 ETH)
    uint256 private _creationFee;

    /// @dev Accumulated fees from escrow creations
    uint256 private _accumulatedFees;

    /// @dev Storage gap for future variables (50 - 8 used slots = 42)
    uint256[42] private __gap;

    /**
     * @dev Initialize the factory contract
     * @param escrowImplementation_ Address of the escrow implementation contract
     * @param owner_ Address of the contract owner
     */
    function initialize(
        address escrowImplementation_,
        address owner_
    ) public initializer {
        if (escrowImplementation_ == address(0)) revert InvalidAmount();
        if (owner_ == address(0)) revert InvalidBuyer();
        
        // Verify escrowImplementation is a contract
        uint256 size;
        assembly {
            size := extcodesize(escrowImplementation_)
        }
        if (size == 0) revert InvalidContract();

        __Ownable_init(owner_);
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _escrowImplementation = escrowImplementation_;
        _creationFee = 0.0008 ether; // Default fee: 0.0008 ETH
    }

    /**
     * @dev Create a new escrow contract
     * @param params Escrow creation parameters
     * @return escrowAddress Address of the created escrow contract
     */
    function createEscrow(CreateEscrowParams calldata params) 
        external 
        payable
        override 
        whenNotPaused 
        nonReentrant
        returns (address escrowAddress) 
    {
        // Check creation fee
        if (msg.value < _creationFee) revert InsufficientFee();
        
        // Track accumulated fees
        _accumulatedFees += msg.value;
        
        // Validate parameters
        if (params.buyer == address(0)) revert InvalidBuyer();
        if (params.buyer == msg.sender) revert InvalidBuyer(); // Seller can't be buyer
        if (params.amount == 0) revert InvalidAmount();
        if (bytes(params.description).length == 0) revert InvalidDescription();
        if (params.tradeId == bytes32(0)) revert InvalidDescription();

        // Check for duplicate trade IDs
        if (_tradeIdToEscrow[params.tradeId] != address(0)) {
            revert EscrowAlreadyExists();
        }

        // Deploy minimal proxy
        escrowAddress = _escrowImplementation.clone();

        // Initialize the escrow with error handling
        try IEscrow(escrowAddress).initialize(
            msg.sender,    // seller
            params.buyer,
            params.amount,
            params.description,
            params.customTimeLock,
            params.tradeId,
            address(this)  // factory address
        ) {
            // Initialization successful
        } catch {
            revert InitializationFailed();
        }

        // Update mappings
        _sellerEscrows[msg.sender].push(escrowAddress);
        _escrowExists[escrowAddress] = true;
        _tradeIdToEscrow[params.tradeId] = escrowAddress;
        _totalEscrows++;

        emit EscrowCreated(
            escrowAddress,
            msg.sender,
            params.buyer,
            params.tradeId,
            params.amount
        );
    }

    /**
     * @dev Get all escrow contracts created by a seller
     * @param seller Seller's address
     * @return escrows Array of escrow contract addresses
     */
    function getSellerEscrows(address seller) 
        external 
        view 
        override 
        returns (address[] memory escrows) 
    {
        return _sellerEscrows[seller];
    }

    /**
     * @dev Get escrow information
     * @param escrow Escrow contract address
     * @return info Complete escrow information
     */
    function getEscrowInfo(address escrow) 
        external 
        view 
        override 
        returns (EscrowInfo memory info) 
    {
        if (!_escrowExists[escrow]) revert EscrowNotFound();
        return IEscrow(escrow).getEscrowInfo();
    }

    /**
     * @dev Check if an escrow contract exists
     * @param escrow Escrow contract address
     * @return exists True if escrow exists
     */
    function escrowExists(address escrow) 
        external 
        view 
        override 
        returns (bool exists) 
    {
        return _escrowExists[escrow];
    }

    /**
     * @dev Get total number of escrows created by a seller
     * @param seller Seller's address
     * @return count Number of escrows
     */
    function getSellerEscrowCount(address seller) 
        external 
        view 
        override 
        returns (uint256 count) 
    {
        return _sellerEscrows[seller].length;
    }

    /**
     * @dev Get current escrow implementation address
     * @return implementation Current implementation address
     */
    function getEscrowImplementation() 
        external 
        view 
        override 
        returns (address implementation) 
    {
        return _escrowImplementation;
    }

    /**
     * @dev Get module address by name
     * @param moduleName Name of the module
     * @return moduleAddress Address of the module
     */
    function getModule(string calldata moduleName) 
        external 
        view 
        override 
        returns (address moduleAddress) 
    {
        return _modules[moduleName];
    }

    /**
     * @dev Check if factory is paused
     * @return paused True if factory is paused
     */
    function isPaused() 
        external 
        view 
        override 
        returns (bool) 
    {
        return paused();
    }

    /**
     * @dev Get total number of escrows created
     * @return total Total escrow count
     */
    function getTotalEscrows() external view returns (uint256 total) {
        return _totalEscrows;
    }

    /**
     * @dev Get escrow address by trade ID
     * @param tradeId Trade identifier
     * @return escrow Escrow contract address
     */
    function getEscrowByTradeId(bytes32 tradeId) external view returns (address escrow) {
        return _tradeIdToEscrow[tradeId];
    }

    // === ADMIN FUNCTIONS ===

    /**
     * @dev Update escrow implementation (owner only)
     * @param newImplementation New implementation address
     */
    function updateEscrowImplementation(address newImplementation) 
        external 
        onlyOwner 
    {
        if (newImplementation == address(0)) revert InvalidAmount();
        
        // Verify newImplementation is a contract
        uint256 size;
        assembly {
            size := extcodesize(newImplementation)
        }
        if (size == 0) revert InvalidContract();
        
        address oldImplementation = _escrowImplementation;
        _escrowImplementation = newImplementation;
        
        emit EscrowImplementationUpdated(oldImplementation, newImplementation);
    }

    /**
     * @dev Set or update a module address (owner only)
     * @param moduleName Name of the module
     * @param moduleAddress Address of the module
     */
    function setModule(string calldata moduleName, address moduleAddress) 
        external 
        onlyOwner 
    {
        if (bytes(moduleName).length == 0) revert InvalidDescription();
        // Allow zero address for module removal/fallback scenarios
        // if (moduleAddress == address(0)) revert InvalidAmount();

        address oldModule = _modules[moduleName];
        _modules[moduleName] = moduleAddress;

        emit ModuleUpdated(moduleName, oldModule, moduleAddress);
    }

    /**
     * @dev Pause the factory (owner only)
     */
    function pause() external onlyOwner {
        _pause();
        emit FactoryPaused(msg.sender);
    }

    /**
     * @dev Unpause the factory (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
        emit FactoryUnpaused(msg.sender);
    }

    /**
     * @dev Update creation fee (owner only)
     * @param newFee New creation fee in wei
     */
    function updateCreationFee(uint256 newFee) 
        external 
        onlyOwner 
    {
        uint256 oldFee = _creationFee;
        _creationFee = newFee;
        emit CreationFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Withdraw accumulated fees (owner only)
     * @param recipient Address to receive fees
     * @param amount Amount to withdraw
     */
    function withdrawFees(address recipient, uint256 amount) 
        external 
        onlyOwner 
        nonReentrant
    {
        if (recipient == address(0)) revert InvalidBuyer();
        if (amount > _accumulatedFees) revert InvalidAmount();
        
        _accumulatedFees -= amount;
        
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit FeesWithdrawn(recipient, amount);
    }

    /**
     * @dev Get current creation fee
     * @return fee Creation fee in wei
     */
    function getCreationFee() external view returns (uint256) {
        return _creationFee;
    }

    /**
     * @dev Get accumulated fees
     * @return balance Total fees collected
     */
    function getAccumulatedFees() external view returns (uint256) {
        return _accumulatedFees;
    }

    /**
     * @dev Authorize upgrade (required by UUPS)
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOwner 
    {}

    /**
     * @dev Get implementation version
     * @return version Current version string
     */
    function version() external pure returns (string memory) {
        return "1.1.0"; // Updated version for fee feature
    }
}