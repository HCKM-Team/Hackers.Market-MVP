# Hackers.Market Smart Contracts Development Documentation
## Anti-Coercion P2P Escrow Protocol - Technical Specification v1.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Design Principles](#2-architecture-design-principles)
3. [Core Contracts](#3-core-contracts)
   - [3.1 EscrowFactory Contract](#31-escrowfactory-contract)
   - [3.2 EscrowImplementation Contract](#32-escrowimplementation-contract)
   - [3.3 Infrastructure Modules](#33-infrastructure-modules)
4. [Module Contracts](#4-module-contracts)
   - [4.1 KYCModule Contract](#41-kycmodule-contract)
   - [4.2 TimeLockModule Contract](#42-timelockmodule-contract)
   - [4.3 DisputeResolver Contract](#43-disputeresolver-contract)
   - [4.4 ReputationOracle Contract](#44-reputationoracle-contract)
   - [4.5 EmergencyModule Contract](#45-emergencymodule-contract)
5. [Integration Contracts](#5-integration-contracts)
   - [5.1 1inch Integration](#51-1inch-integration)
   - [5.2 Circle USDC/EURC Integration](#52-circle-usdceurc-integration)
   - [5.3 LayerZero OFT Integration](#53-layerzero-oft-integration)
6. [Security Mechanisms](#6-security-mechanisms)
   - [6.1 Time-Lock Protection](#61-time-lock-protection)
   - [6.2 Multi-Signature Requirements](#62-multi-signature-requirements)
   - [6.3 Emergency Response](#63-emergency-response)
   - [6.4 Audit Requirements](#64-audit-requirements)
7. [Deployment Strategy](#7-deployment-strategy)
   - [7.1 Deployment Order](#71-deployment-order)
   - [7.2 Network Configuration](#72-network-configuration)
   - [7.3 Gas Optimization Strategies](#73-gas-optimization-strategies)
8. [Testing & Auditing](#8-testing--auditing)
   - [8.1 Test Coverage Requirements](#81-test-coverage-requirements)
   - [8.2 Security Audit Checklist](#82-security-audit-checklist)
   - [8.3 Testing Framework](#83-testing-framework)
9. [Gas Optimization](#9-gas-optimization)
   - [9.1 Storage Optimization](#91-storage-optimization)
   - [9.2 Computation Optimization](#92-computation-optimization)
   - [9.3 Deployment Optimization](#93-deployment-optimization)
10. [Upgrade Patterns](#10-upgrade-patterns)
    - [10.1 Module Upgrades](#101-module-upgrades)
    - [10.2 Emergency Upgrades](#102-emergency-upgrades)
    - [10.3 Migration Strategy](#103-migration-strategy)
11. [Hardhat Development Environment](#11-hardhat-development-environment)
    - [11.1 Project Setup](#111-project-setup)
      - [11.1.1 Initialize Hardhat Project](#1111-initialize-hardhat-project)
      - [11.1.2 Project Structure](#1112-project-structure)
    - [11.2 Hardhat Configuration](#112-hardhat-configuration)
      - [11.2.1 hardhat.config.js](#1121-hardhatconfigjs)
      - [11.2.2 .env.example](#1122-envexample)
    - [11.3 Deployment Scripts](#113-deployment-scripts)
      - [11.3.1 Deploy Modules Script](#1131-deploy-modules-script)
      - [11.3.2 Deploy Factory Script](#1132-deploy-factory-script)
    - [11.4 Testing Framework](#114-testing-framework)
      - [11.4.1 Test Helpers](#1141-test-helpers)
      - [11.4.2 Unit Test Example](#1142-unit-test-example)
      - [11.4.3 Integration Test Example](#1143-integration-test-example)
    - [11.5 Hardhat Tasks](#115-hardhat-tasks)
      - [11.5.1 Account Management Task](#1151-account-management-task)
      - [11.5.2 Contract Verification Task](#1152-contract-verification-task)
      - [11.5.3 Interaction Task](#1153-interaction-task)
    - [11.6 Package.json Scripts](#116-packagejson-scripts)

---

## 1. Overview

The Hackers.Market smart contract system implements a revolutionary anti-coercion protocol for P2P trading. The architecture uses a modular factory pattern where sellers deploy their own escrow contracts while benefiting from shared security infrastructure.

### Key Features:
- **Time-locked fund release** preventing immediate access
- **Emergency intervention mechanisms** for duress situations
- **Decentralized dispute resolution** with multiple tiers
- **Cross-chain compatibility** via LayerZero OFT
- **Multi-DID reputation aggregation** from 7+ providers
- **EIP-7702 support** for future account abstraction

### Technical Stack:
- Solidity ^0.8.20
- OpenZeppelin Contracts 5.0
- LayerZero V2 Protocol
- 1inch Fusion+ SDK
- Circle CCTP Protocol
- EIP-1967 Proxy Pattern
- EIP-712 Typed Signatures

---

## 2. Architecture Design Principles

### 2.1 Modularity
Each functional component is isolated into separate modules that can be upgraded independently without affecting core escrow logic.

### 2.2 Gas Efficiency
- Minimal proxy pattern for escrow instances
- Packed struct storage
- Efficient state transitions
- Batch operations where possible

### 2.3 Security First
- Multiple security layers
- Fail-safe defaults
- Emergency mechanisms
- Time-based protections

### 2.4 Decentralization
- No admin keys for fund control
- Community governance for disputes
- Decentralized reputation sources
- Permissionless escrow creation

---

## 3. Core Contracts

### 3.1 EscrowFactory Contract

The factory contract deploys minimal proxy instances of escrows and manages the infrastructure.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract EscrowFactory is Ownable, ReentrancyGuard {
    using Clones for address;
    
    // State Variables
    address public immutable escrowImplementation;
    mapping(address => address[]) public sellerEscrows;
    mapping(address => bool) public isValidEscrow;
    
    // Infrastructure References
    IKYCModule public kycModule;
    ITimeLockModule public timeLockModule;
    IDisputeResolver public disputeResolver;
    IReputationOracle public reputationOracle;
    IEmergencyModule public emergencyModule;
    
    // Fee Management
    uint256 public constant INFRASTRUCTURE_FEE_BPS = 250; // 2.5%
    address public feeCollector;
    
    // Events
    event EscrowCreated(
        address indexed escrow,
        address indexed seller,
        uint256 price,
        bytes32 itemHash
    );
    event ModuleUpdated(string moduleName, address newModule);
    event FeeCollected(address escrow, uint256 amount);
    
    // Errors
    error InvalidModule();
    error UnauthorizedCaller();
    error InvalidParameters();
    
    /**
     * @dev Creates a new escrow instance with minimal proxy pattern
     * @param _price Price in payment token
     * @param _paymentToken ERC20 token address (or address(0) for ETH)
     * @param _itemHash IPFS hash of item details
     * @param _deliveryMethod Delivery method enum
     * @param _customTimeLock Optional custom time-lock period
     */
    function createEscrow(
        uint256 _price,
        address _paymentToken,
        bytes32 _itemHash,
        DeliveryMethod _deliveryMethod,
        uint256 _customTimeLock
    ) external nonReentrant returns (address escrow) {
        // Deploy minimal proxy
        escrow = escrowImplementation.clone();
        
        // Initialize escrow
        IEscrowImplementation(escrow).initialize(
            msg.sender,
            _price,
            _paymentToken,
            _itemHash,
            _deliveryMethod,
            _customTimeLock,
            address(this)
        );
        
        // Track escrow
        sellerEscrows[msg.sender].push(escrow);
        isValidEscrow[escrow] = true;
        
        emit EscrowCreated(escrow, msg.sender, _price, _itemHash);
    }
    
    /**
     * @dev Updates infrastructure module references
     * @param _moduleName Name of module to update
     * @param _newModule New module address
     */
    function updateModule(
        string calldata _moduleName,
        address _newModule
    ) external onlyOwner {
        if (_newModule == address(0)) revert InvalidModule();
        
        bytes32 moduleHash = keccak256(bytes(_moduleName));
        
        if (moduleHash == keccak256("KYC")) {
            kycModule = IKYCModule(_newModule);
        } else if (moduleHash == keccak256("TimeLock")) {
            timeLockModule = ITimeLockModule(_newModule);
        } else if (moduleHash == keccak256("Dispute")) {
            disputeResolver = IDisputeResolver(_newModule);
        } else if (moduleHash == keccak256("Reputation")) {
            reputationOracle = IReputationOracle(_newModule);
        } else if (moduleHash == keccak256("Emergency")) {
            emergencyModule = IEmergencyModule(_newModule);
        } else {
            revert InvalidModule();
        }
        
        emit ModuleUpdated(_moduleName, _newModule);
    }
    
    /**
     * @dev Collects infrastructure fees from completed escrows
     * @param _escrow Escrow address
     */
    function collectFees(address _escrow) external {
        if (!isValidEscrow[_escrow]) revert UnauthorizedCaller();
        
        uint256 fee = IEscrowImplementation(_escrow).collectInfrastructureFee();
        if (fee > 0) {
            emit FeeCollected(_escrow, fee);
        }
    }
    
    // View Functions
    function getSellerEscrows(address _seller) external view returns (address[] memory) {
        return sellerEscrows[_seller];
    }
    
    function getModules() external view returns (
        address _kyc,
        address _timeLock,
        address _dispute,
        address _reputation,
        address _emergency
    ) {
        return (
            address(kycModule),
            address(timeLockModule),
            address(disputeResolver),
            address(reputationOracle),
            address(emergencyModule)
        );
    }
}
```

### 3.2 EscrowImplementation Contract

The implementation contract contains the core escrow logic.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EscrowImplementation is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    
    // Enums
    enum EscrowState {
        Created,
        Funded,
        Locked,
        Released,
        Refunded,
        Disputed,
        Emergency
    }
    
    enum DeliveryMethod {
        InPerson,
        Shipping,
        Digital,
        Service
    }
    
    // State Variables
    address public seller;
    address public buyer;
    uint256 public price;
    address public paymentToken;
    bytes32 public itemHash;
    DeliveryMethod public deliveryMethod;
    EscrowState public state;
    
    // Security Features
    uint256 public fundedAt;
    uint256 public deliveredAt;
    uint256 public releaseTime;
    bytes32 public emergencyHash;
    uint256 public emergencyActivations;
    
    // Factory Reference
    address public factory;
    
    // Constants
    uint256 public constant MAX_EMERGENCY_ACTIVATIONS = 3;
    uint256 public constant EMERGENCY_EXTENSION = 72 hours;
    uint256 public constant DISPUTE_WINDOW = 24 hours;
    
    // Events
    event EscrowFunded(address indexed buyer, uint256 amount);
    event DeliveryConfirmed(uint256 releaseTime);
    event FundsReleased(address indexed seller, uint256 amount);
    event FundsRefunded(address indexed buyer, uint256 amount);
    event DisputeRaised(address indexed party, string reason);
    event EmergencyActivated(uint256 newReleaseTime);
    
    // Errors
    error InvalidState();
    error UnauthorizedCaller();
    error InsufficientPayment();
    error KYCRequired();
    error TimeLockActive();
    error EmergencyLimitReached();
    error InvalidEmergencyCode();
    
    // Modifiers
    modifier onlyParty() {
        if (msg.sender != seller && msg.sender != buyer) {
            revert UnauthorizedCaller();
        }
        _;
    }
    
    modifier inState(EscrowState _state) {
        if (state != _state) revert InvalidState();
        _;
    }
    
    /**
     * @dev Initializes the escrow contract
     */
    function initialize(
        address _seller,
        uint256 _price,
        address _paymentToken,
        bytes32 _itemHash,
        DeliveryMethod _deliveryMethod,
        uint256 _customTimeLock,
        address _factory
    ) external {
        require(seller == address(0), "Already initialized");
        
        seller = _seller;
        price = _price;
        paymentToken = _paymentToken;
        itemHash = _itemHash;
        deliveryMethod = _deliveryMethod;
        factory = _factory;
        state = EscrowState.Created;
        
        // Calculate initial time-lock from factory modules
        if (_customTimeLock > 0) {
            releaseTime = block.timestamp + _customTimeLock;
        }
    }
    
    /**
     * @dev Buyer funds the escrow
     * @param _emergencyCode Emergency code for panic situations
     */
    function fundEscrow(string calldata _emergencyCode) external payable nonReentrant inState(EscrowState.Created) {
        // Verify KYC through factory
        IEscrowFactory factoryContract = IEscrowFactory(factory);
        if (!factoryContract.kycModule().isVerified(msg.sender)) {
            revert KYCRequired();
        }
        
        buyer = msg.sender;
        
        // Handle payment
        if (paymentToken == address(0)) {
            if (msg.value < price) revert InsufficientPayment();
        } else {
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), price);
        }
        
        // Set emergency hash
        emergencyHash = keccak256(abi.encodePacked(msg.sender, _emergencyCode));
        
        // Update state
        fundedAt = block.timestamp;
        state = EscrowState.Funded;
        
        emit EscrowFunded(msg.sender, price);
    }
    
    /**
     * @dev Seller confirms delivery/service completion
     */
    function confirmDelivery() external nonReentrant onlyParty inState(EscrowState.Funded) {
        if (msg.sender != seller) revert UnauthorizedCaller();
        
        deliveredAt = block.timestamp;
        
        // Calculate release time based on modules
        IEscrowFactory factoryContract = IEscrowFactory(factory);
        uint256 timeLock = factoryContract.timeLockModule().calculateTimeLock(
            seller,
            buyer,
            price,
            uint256(deliveryMethod)
        );
        
        releaseTime = block.timestamp + timeLock;
        state = EscrowState.Locked;
        
        emit DeliveryConfirmed(releaseTime);
    }
    
    /**
     * @dev Releases funds to seller after time-lock
     */
    function releaseFunds() external nonReentrant inState(EscrowState.Locked) {
        if (block.timestamp < releaseTime) revert TimeLockActive();
        
        state = EscrowState.Released;
        
        // Calculate fees
        uint256 fee = (price * 250) / 10000; // 2.5%
        uint256 sellerAmount = price - fee;
        
        // Transfer funds
        if (paymentToken == address(0)) {
            payable(seller).transfer(sellerAmount);
            payable(factory).transfer(fee);
        } else {
            IERC20(paymentToken).safeTransfer(seller, sellerAmount);
            IERC20(paymentToken).safeTransfer(factory, fee);
        }
        
        // Update reputation
        IEscrowFactory(factory).reputationOracle().recordSuccessfulTrade(
            seller,
            buyer,
            price
        );
        
        emit FundsReleased(seller, sellerAmount);
    }
    
    /**
     * @dev Activates emergency mode with panic code
     * @param _emergencyCode The emergency code set during funding
     */
    function activateEmergency(string calldata _emergencyCode) external nonReentrant {
        if (state != EscrowState.Locked && state != EscrowState.Funded) {
            revert InvalidState();
        }
        
        // Verify emergency code
        bytes32 providedHash = keccak256(abi.encodePacked(buyer, _emergencyCode));
        if (providedHash != emergencyHash) revert InvalidEmergencyCode();
        
        // Check activation limit
        if (emergencyActivations >= MAX_EMERGENCY_ACTIVATIONS) {
            revert EmergencyLimitReached();
        }
        
        emergencyActivations++;
        releaseTime = block.timestamp + EMERGENCY_EXTENSION;
        state = EscrowState.Emergency;
        
        // Notify emergency module
        IEscrowFactory(factory).emergencyModule().handleEmergency(
            address(this),
            seller,
            buyer
        );
        
        emit EmergencyActivated(releaseTime);
    }
    
    /**
     * @dev Raises a dispute
     * @param _reason Dispute reason
     */
    function raiseDispute(string calldata _reason) external nonReentrant onlyParty {
        if (state != EscrowState.Funded && state != EscrowState.Locked) {
            revert InvalidState();
        }
        
        state = EscrowState.Disputed;
        
        // Submit to dispute resolver
        IEscrowFactory(factory).disputeResolver().createDispute(
            address(this),
            msg.sender,
            _reason
        );
        
        emit DisputeRaised(msg.sender, _reason);
    }
    
    /**
     * @dev Executes dispute resolution
     * @param _winner Address to receive funds
     */
    function executeDisputeResolution(address _winner) external {
        IEscrowFactory factoryContract = IEscrowFactory(factory);
        if (msg.sender != address(factoryContract.disputeResolver())) {
            revert UnauthorizedCaller();
        }
        
        if (state != EscrowState.Disputed) revert InvalidState();
        
        if (_winner == seller) {
            state = EscrowState.Released;
            _transferFunds(seller);
        } else if (_winner == buyer) {
            state = EscrowState.Refunded;
            _transferFunds(buyer);
        }
    }
    
    /**
     * @dev Internal function to transfer funds
     */
    function _transferFunds(address _to) private {
        uint256 amount = price;
        
        if (paymentToken == address(0)) {
            payable(_to).transfer(amount);
        } else {
            IERC20(paymentToken).safeTransfer(_to, amount);
        }
    }
    
    /**
     * @dev Collects infrastructure fee (called by factory)
     */
    function collectInfrastructureFee() external returns (uint256) {
        if (msg.sender != factory) revert UnauthorizedCaller();
        if (state != EscrowState.Released) return 0;
        
        uint256 fee = (price * 250) / 10000;
        return fee;
    }
    
    // View Functions
    function getEscrowDetails() external view returns (
        address _seller,
        address _buyer,
        uint256 _price,
        EscrowState _state,
        uint256 _releaseTime
    ) {
        return (seller, buyer, price, state, releaseTime);
    }
    
    function getTimeRemaining() external view returns (uint256) {
        if (block.timestamp >= releaseTime) return 0;
        return releaseTime - block.timestamp;
    }
}
```

### 3.3 Infrastructure Modules

The modular infrastructure allows for upgradeability and separation of concerns.

---

## 4. Module Contracts

### 4.1 KYCModule Contract

Manages multi-provider DID verification and KYC compliance.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract KYCModule is AccessControl {
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    
    // Structs
    struct VerificationData {
        uint8 level; // 0-100 verification score
        uint256 timestamp;
        uint256 expiry;
        mapping(address => uint8) providerScores;
    }
    
    struct Provider {
        string name;
        uint8 weight; // Weight in final score calculation
        bool active;
    }
    
    // State Variables
    mapping(address => VerificationData) public verifications;
    mapping(address => Provider) public providers;
    address[] public providerList;
    
    // Configuration
    uint8 public constant MIN_VERIFICATION_SCORE = 50;
    uint256 public constant VERIFICATION_VALIDITY = 180 days;
    
    // Events
    event UserVerified(address indexed user, uint8 score, address provider);
    event ProviderAdded(address indexed provider, string name, uint8 weight);
    event ProviderUpdated(address indexed provider, uint8 weight, bool active);
    
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Adds a new DID provider
     * @param _provider Provider address
     * @param _name Provider name (ENS, Lens, WorldID, etc.)
     * @param _weight Weight in score calculation
     */
    function addProvider(
        address _provider,
        string calldata _name,
        uint8 _weight
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_weight > 0 && _weight <= 100, "Invalid weight");
        require(!providers[_provider].active, "Provider exists");
        
        providers[_provider] = Provider({
            name: _name,
            weight: _weight,
            active: true
        });
        
        providerList.push(_provider);
        _setupRole(PROVIDER_ROLE, _provider);
        
        emit ProviderAdded(_provider, _name, _weight);
    }
    
    /**
     * @dev Updates user verification from a provider
     * @param _user User address
     * @param _score Verification score (0-100)
     */
    function updateVerification(
        address _user,
        uint8 _score
    ) external onlyRole(PROVIDER_ROLE) {
        require(_score <= 100, "Invalid score");
        require(providers[msg.sender].active, "Provider inactive");
        
        VerificationData storage userData = verifications[_user];
        userData.providerScores[msg.sender] = _score;
        userData.timestamp = block.timestamp;
        userData.expiry = block.timestamp + VERIFICATION_VALIDITY;
        
        // Calculate weighted average score
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        
        for (uint i = 0; i < providerList.length; i++) {
            address provider = providerList[i];
            if (providers[provider].active) {
                uint8 providerScore = userData.providerScores[provider];
                if (providerScore > 0) {
                    weightedSum += providerScore * providers[provider].weight;
                    totalWeight += providers[provider].weight;
                }
            }
        }
        
        if (totalWeight > 0) {
            userData.level = uint8(weightedSum / totalWeight);
        }
        
        emit UserVerified(_user, userData.level, msg.sender);
    }
    
    /**
     * @dev Checks if a user is verified
     * @param _user User address
     * @return bool Whether user meets minimum verification requirements
     */
    function isVerified(address _user) external view returns (bool) {
        VerificationData storage userData = verifications[_user];
        return (
            userData.level >= MIN_VERIFICATION_SCORE &&
            block.timestamp < userData.expiry
        );
    }
    
    /**
     * @dev Gets user's verification score
     * @param _user User address
     * @return score Current verification score
     * @return expiry Verification expiry timestamp
     */
    function getVerificationScore(address _user) external view returns (
        uint8 score,
        uint256 expiry
    ) {
        VerificationData storage userData = verifications[_user];
        return (userData.level, userData.expiry);
    }
    
    /**
     * @dev Gets verification score from specific provider
     * @param _user User address
     * @param _provider Provider address
     * @return score Provider-specific score
     */
    function getProviderScore(
        address _user,
        address _provider
    ) external view returns (uint8) {
        return verifications[_user].providerScores[_provider];
    }
    
    /**
     * @dev Updates provider configuration
     * @param _provider Provider address
     * @param _weight New weight
     * @param _active Active status
     */
    function updateProvider(
        address _provider,
        uint8 _weight,
        bool _active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(providers[_provider].weight > 0, "Provider not found");
        require(_weight > 0 && _weight <= 100, "Invalid weight");
        
        providers[_provider].weight = _weight;
        providers[_provider].active = _active;
        
        emit ProviderUpdated(_provider, _weight, _active);
    }
}
```

### 4.2 TimeLockModule Contract

Calculates dynamic time-locks based on multiple risk factors.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TimeLockModule is Ownable {
    // Structs
    struct TimeLockConfig {
        uint256 minLockPeriod;
        uint256 maxLockPeriod;
        uint256 baseMultiplier;
        uint256 riskMultiplier;
    }
    
    struct RiskFactors {
        uint8 sellerReputation;
        uint8 buyerReputation;
        uint8 sellerKYC;
        uint8 buyerKYC;
        uint256 transactionValue;
        uint8 deliveryMethod;
        uint256 historicalDisputes;
    }
    
    // State Variables
    TimeLockConfig public config;
    mapping(uint8 => uint256) public deliveryMethodMultipliers;
    
    // Interfaces
    IReputationOracle public reputationOracle;
    IKYCModule public kycModule;
    
    // Events
    event ConfigUpdated(
        uint256 minLock,
        uint256 maxLock,
        uint256 baseMultiplier,
        uint256 riskMultiplier
    );
    event DeliveryMultiplierSet(uint8 method, uint256 multiplier);
    
    constructor(address _reputationOracle, address _kycModule) {
        reputationOracle = IReputationOracle(_reputationOracle);
        kycModule = IKYCModule(_kycModule);
        
        // Default configuration
        config = TimeLockConfig({
            minLockPeriod: 1 hours,
            maxLockPeriod: 7 days,
            baseMultiplier: 100,
            riskMultiplier: 150
        });
        
        // Default delivery method multipliers
        deliveryMethodMultipliers[0] = 200; // InPerson - highest risk
        deliveryMethodMultipliers[1] = 150; // Shipping
        deliveryMethodMultipliers[2] = 100; // Digital
        deliveryMethodMultipliers[3] = 120; // Service
    }
    
    /**
     * @dev Calculates time-lock period based on risk factors
     * @param _seller Seller address
     * @param _buyer Buyer address
     * @param _value Transaction value
     * @param _deliveryMethod Delivery method enum
     * @return lockPeriod Calculated lock period in seconds
     */
    function calculateTimeLock(
        address _seller,
        address _buyer,
        uint256 _value,
        uint8 _deliveryMethod
    ) external view returns (uint256 lockPeriod) {
        RiskFactors memory factors = _gatherRiskFactors(
            _seller,
            _buyer,
            _value,
            _deliveryMethod
        );
        
        // Base calculation
        uint256 riskScore = _calculateRiskScore(factors);
        
        // Apply value-based scaling
        uint256 valueMultiplier = _getValueMultiplier(_value);
        
        // Calculate final lock period
        lockPeriod = config.minLockPeriod * riskScore * valueMultiplier / 10000;
        
        // Apply bounds
        if (lockPeriod < config.minLockPeriod) {
            lockPeriod = config.minLockPeriod;
        } else if (lockPeriod > config.maxLockPeriod) {
            lockPeriod = config.maxLockPeriod;
        }
        
        return lockPeriod;
    }
    
    /**
     * @dev Gathers risk factors for calculation
     */
    function _gatherRiskFactors(
        address _seller,
        address _buyer,
        uint256 _value,
        uint8 _deliveryMethod
    ) private view returns (RiskFactors memory) {
        // Get reputation scores
        (uint8 sellerRep,) = reputationOracle.getReputation(_seller);
        (uint8 buyerRep,) = reputationOracle.getReputation(_buyer);
        
        // Get KYC scores
        (uint8 sellerKYC,) = kycModule.getVerificationScore(_seller);
        (uint8 buyerKYC,) = kycModule.getVerificationScore(_buyer);
        
        // Get dispute history
        uint256 disputes = reputationOracle.getDisputeCount(_seller) + 
                          reputationOracle.getDisputeCount(_buyer);
        
        return RiskFactors({
            sellerReputation: sellerRep,
            buyerReputation: buyerRep,
            sellerKYC: sellerKYC,
            buyerKYC: buyerKYC,
            transactionValue: _value,
            deliveryMethod: _deliveryMethod,
            historicalDisputes: disputes
        });
    }
    
    /**
     * @dev Calculates risk score from factors
     */
    function _calculateRiskScore(
        RiskFactors memory factors
    ) private view returns (uint256) {
        uint256 score = config.baseMultiplier;
        
        // Reputation impact (lower reputation = higher risk)
        uint256 avgReputation = (factors.sellerReputation + factors.buyerReputation) / 2;
        if (avgReputation < 50) {
            score = score * config.riskMultiplier / 100;
        } else if (avgReputation > 80) {
            score = score * 80 / 100; // 20% reduction for high reputation
        }
        
        // KYC impact
        uint256 avgKYC = (factors.sellerKYC + factors.buyerKYC) / 2;
        if (avgKYC < 50) {
            score = score * 130 / 100; // 30% increase for low KYC
        } else if (avgKYC > 80) {
            score = score * 90 / 100; // 10% reduction for high KYC
        }
        
        // Delivery method impact
        score = score * deliveryMethodMultipliers[factors.deliveryMethod] / 100;
        
        // Dispute history impact
        if (factors.historicalDisputes > 0) {
            score = score * (100 + factors.historicalDisputes * 10) / 100;
        }
        
        return score;
    }
    
    /**
     * @dev Gets value-based multiplier
     */
    function _getValueMultiplier(uint256 _value) private pure returns (uint256) {
        if (_value < 100e18) return 100; // < $100
        if (_value < 1000e18) return 120; // $100-$1000
        if (_value < 10000e18) return 150; // $1000-$10000
        return 200; // > $10000
    }
    
    /**
     * @dev Updates configuration
     */
    function updateConfig(
        uint256 _minLock,
        uint256 _maxLock,
        uint256 _baseMultiplier,
        uint256 _riskMultiplier
    ) external onlyOwner {
        require(_minLock > 0 && _minLock < _maxLock, "Invalid lock periods");
        require(_baseMultiplier > 0 && _riskMultiplier > 0, "Invalid multipliers");
        
        config = TimeLockConfig({
            minLockPeriod: _minLock,
            maxLockPeriod: _maxLock,
            baseMultiplier: _baseMultiplier,
            riskMultiplier: _riskMultiplier
        });
        
        emit ConfigUpdated(_minLock, _maxLock, _baseMultiplier, _riskMultiplier);
    }
    
    /**
     * @dev Sets delivery method multiplier
     */
    function setDeliveryMultiplier(
        uint8 _method,
        uint256 _multiplier
    ) external onlyOwner {
        require(_multiplier > 0 && _multiplier <= 1000, "Invalid multiplier");
        deliveryMethodMultipliers[_method] = _multiplier;
        emit DeliveryMultiplierSet(_method, _multiplier);
    }
}
```

### 4.3 DisputeResolver Contract

Multi-tiered dispute resolution system with automated and manual options.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DisputeResolver is AccessControl, ReentrancyGuard {
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant JURY_ROLE = keccak256("JURY_ROLE");
    
    // Enums
    enum DisputeStatus {
        Open,
        UnderReview,
        Resolved,
        Escalated,
        Closed
    }
    
    enum ResolutionType {
        Automated,
        JuryVote,
        Arbitrator
    }
    
    // Structs
    struct Dispute {
        address escrow;
        address initiator;
        address respondent;
        string reason;
        DisputeStatus status;
        ResolutionType resolutionType;
        uint256 createdAt;
        uint256 deadline;
        address winner;
        mapping(address => bool) hasVoted;
        mapping(address => address) votes;
        uint256 votesForInitiator;
        uint256 votesForRespondent;
    }
    
    struct Evidence {
        address submitter;
        string ipfsHash;
        uint256 timestamp;
    }
    
    // State Variables
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => Evidence[]) public evidences;
    mapping(address => uint256[]) public userDisputes;
    uint256 public disputeCounter;
    
    // Configuration
    uint256 public constant EVIDENCE_PERIOD = 48 hours;
    uint256 public constant VOTING_PERIOD = 72 hours;
    uint256 public constant MIN_JURY_SIZE = 7;
    uint256 public constant JURY_REWARD = 0.01 ether;
    
    // Events
    event DisputeCreated(
        uint256 indexed disputeId,
        address indexed escrow,
        address initiator,
        string reason
    );
    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address submitter,
        string ipfsHash
    );
    event DisputeResolved(
        uint256 indexed disputeId,
        address winner,
        ResolutionType resolutionType
    );
    event JuryVote(
        uint256 indexed disputeId,
        address juror,
        address votedFor
    );
    
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Creates a new dispute
     * @param _escrow Escrow contract address
     * @param _initiator Party initiating dispute
     * @param _reason Dispute reason
     */
    function createDispute(
        address _escrow,
        address _initiator,
        string calldata _reason
    ) external returns (uint256 disputeId) {
        // Verify caller is the escrow contract
        IEscrowImplementation escrow = IEscrowImplementation(_escrow);
        (address seller, address buyer,,,) = escrow.getEscrowDetails();
        
        require(
            msg.sender == _escrow || msg.sender == _initiator,
            "Unauthorized"
        );
        
        disputeId = ++disputeCounter;
        Dispute storage dispute = disputes[disputeId];
        
        dispute.escrow = _escrow;
        dispute.initiator = _initiator;
        dispute.respondent = _initiator == seller ? buyer : seller;
        dispute.reason = _reason;
        dispute.status = DisputeStatus.Open;
        dispute.createdAt = block.timestamp;
        dispute.deadline = block.timestamp + EVIDENCE_PERIOD;
        
        userDisputes[_initiator].push(disputeId);
        userDisputes[dispute.respondent].push(disputeId);
        
        emit DisputeCreated(disputeId, _escrow, _initiator, _reason);
        
        // Check for automated resolution
        if (_checkAutomatedResolution(disputeId)) {
            _resolveAutomatically(disputeId);
        }
    }
    
    /**
     * @dev Submits evidence for a dispute
     * @param _disputeId Dispute ID
     * @param _ipfsHash IPFS hash of evidence
     */
    function submitEvidence(
        uint256 _disputeId,
        string calldata _ipfsHash
    ) external {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.Open, "Invalid status");
        require(
            msg.sender == dispute.initiator || msg.sender == dispute.respondent,
            "Not a party"
        );
        require(block.timestamp < dispute.deadline, "Evidence period ended");
        
        evidences[_disputeId].push(Evidence({
            submitter: msg.sender,
            ipfsHash: _ipfsHash,
            timestamp: block.timestamp
        }));
        
        emit EvidenceSubmitted(_disputeId, msg.sender, _ipfsHash);
    }
    
    /**
     * @dev Escalates dispute to jury voting
     * @param _disputeId Dispute ID
     */
    function escalateToJury(uint256 _disputeId) external {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.Open, "Invalid status");
        require(block.timestamp >= dispute.deadline, "Evidence period active");
        require(
            msg.sender == dispute.initiator || msg.sender == dispute.respondent,
            "Not a party"
        );
        
        dispute.status = DisputeStatus.UnderReview;
        dispute.resolutionType = ResolutionType.JuryVote;
        dispute.deadline = block.timestamp + VOTING_PERIOD;
    }
    
    /**
     * @dev Jury member casts vote
     * @param _disputeId Dispute ID
     * @param _voteFor Address to vote for
     */
    function castJuryVote(
        uint256 _disputeId,
        address _voteFor
    ) external onlyRole(JURY_ROLE) {
        Dispute storage dispute = disputes[_disputeId];
        require(dispute.status == DisputeStatus.UnderReview, "Not under review");
        require(dispute.resolutionType == ResolutionType.JuryVote, "Not jury vote");
        require(!dispute.hasVoted[msg.sender], "Already voted");
        require(
            _voteFor == dispute.initiator || _voteFor == dispute.respondent,
            "Invalid vote"
        );
        require(block.timestamp < dispute.deadline, "Voting ended");
        
        dispute.hasVoted[msg.sender] = true;
        dispute.votes[msg.sender] = _voteFor;
        
        if (_voteFor == dispute.initiator) {
            dispute.votesForInitiator++;
        } else {
            dispute.votesForRespondent++;
        }
        
        emit JuryVote(_disputeId, msg.sender, _voteFor);
        
        // Check if voting threshold reached
        uint256 totalVotes = dispute.votesForInitiator + dispute.votesForRespondent;
        if (totalVotes >= MIN_JURY_SIZE) {
            _finalizeJuryVote(_disputeId);
        }
    }
    
    /**
     * @dev Arbitrator resolves dispute
     * @param _disputeId Dispute ID
     * @param _winner Winning party
     * @param _reasoning IPFS hash of reasoning
     */
    function arbitratorResolve(
        uint256 _disputeId,
        address _winner,
        string calldata _reasoning
    ) external onlyRole(ARBITRATOR_ROLE) {
        Dispute storage dispute = disputes[_disputeId];
        require(
            dispute.status == DisputeStatus.Escalated || 
            dispute.status == DisputeStatus.UnderReview,
            "Invalid status"
        );
        require(
            _winner == dispute.initiator || _winner == dispute.respondent,
            "Invalid winner"
        );
        
        dispute.winner = _winner;
        dispute.status = DisputeStatus.Resolved;
        dispute.resolutionType = ResolutionType.Arbitrator;
        
        // Execute resolution on escrow
        IEscrowImplementation(dispute.escrow).executeDisputeResolution(_winner);
        
        emit DisputeResolved(_disputeId, _winner, ResolutionType.Arbitrator);
    }
    
    /**
     * @dev Checks if dispute can be resolved automatically
     */
    function _checkAutomatedResolution(
        uint256 _disputeId
    ) private view returns (bool) {
        Dispute storage dispute = disputes[_disputeId];
        
        // Example automated resolution patterns:
        // 1. Seller has very low reputation and multiple recent disputes
        // 2. Clear evidence of non-delivery based on tracking
        // 3. Pattern matching with previous fraud cases
        
        // This is simplified - real implementation would use ML models
        IReputationOracle repOracle = IReputationOracle(
            IEscrowFactory(msg.sender).reputationOracle()
        );
        
        (uint8 initiatorRep,) = repOracle.getReputation(dispute.initiator);
        (uint8 respondentRep,) = repOracle.getReputation(dispute.respondent);
        
        // Auto-resolve if one party has very low reputation
        if (initiatorRep < 20 && respondentRep > 80) return true;
        if (respondentRep < 20 && initiatorRep > 80) return true;
        
        return false;
    }
    
    /**
     * @dev Resolves dispute automatically
     */
    function _resolveAutomatically(uint256 _disputeId) private {
        Dispute storage dispute = disputes[_disputeId];
        
        // Simplified logic - favor higher reputation party
        IReputationOracle repOracle = IReputationOracle(
            IEscrowFactory(msg.sender).reputationOracle()
        );
        
        (uint8 initiatorRep,) = repOracle.getReputation(dispute.initiator);
        (uint8 respondentRep,) = repOracle.getReputation(dispute.respondent);
        
        dispute.winner = initiatorRep > respondentRep ? 
            dispute.initiator : dispute.respondent;
        dispute.status = DisputeStatus.Resolved;
        dispute.resolutionType = ResolutionType.Automated;
        
        IEscrowImplementation(dispute.escrow).executeDisputeResolution(dispute.winner);
        
        emit DisputeResolved(_disputeId, dispute.winner, ResolutionType.Automated);
    }
    
    /**
     * @dev Finalizes jury voting
     */
    function _finalizeJuryVote(uint256 _disputeId) private {
        Dispute storage dispute = disputes[_disputeId];
        
        dispute.winner = dispute.votesForInitiator > dispute.votesForRespondent ?
            dispute.initiator : dispute.respondent;
        dispute.status = DisputeStatus.Resolved;
        
        IEscrowImplementation(dispute.escrow).executeDisputeResolution(dispute.winner);
        
        emit DisputeResolved(_disputeId, dispute.winner, ResolutionType.JuryVote);
        
        // Distribute jury rewards
        // Implementation would track and reward participating jurors
    }
    
    // View Functions
    function getDisputeDetails(uint256 _disputeId) external view returns (
        address escrow,
        address initiator,
        address respondent,
        DisputeStatus status,
        address winner
    ) {
        Dispute storage dispute = disputes[_disputeId];
        return (
            dispute.escrow,
            dispute.initiator,
            dispute.respondent,
            dispute.status,
            dispute.winner
        );
    }
    
    function getEvidenceCount(uint256 _disputeId) external view returns (uint256) {
        return evidences[_disputeId].length;
    }
    
    function getUserDisputes(address _user) external view returns (uint256[] memory) {
        return userDisputes[_user];
    }
}
```

### 4.4 ReputationOracle Contract

Multi-dimensional reputation scoring with cross-platform aggregation.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ReputationOracle is AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant PLATFORM_ROLE = keccak256("PLATFORM_ROLE");
    
    // Structs
    struct ReputationScore {
        uint8 tradingScore;        // 0-100
        uint8 disputeScore;        // 0-100
        uint8 verificationScore;   // 0-100
        uint8 externalScore;       // 0-100
        uint256 totalVolume;       // Total trading volume
        uint256 successfulTrades;  // Number of successful trades
        uint256 disputesRaised;    // Disputes initiated
        uint256 disputesLost;      // Disputes lost
        uint256 lastUpdate;        // Last update timestamp
    }
    
    struct PairwiseHistory {
        uint256 trades;
        uint256 volume;
        uint256 disputes;
        uint256 lastTrade;
    }
    
    struct ExternalPlatform {
        string name;
        uint8 weight;
        bool active;
    }
    
    // State Variables
    mapping(address => ReputationScore) public reputations;
    mapping(address => mapping(address => PairwiseHistory)) public pairwiseHistory;
    mapping(address => ExternalPlatform) public externalPlatforms;
    address[] public platformList;
    
    // Configuration
    uint256 public constant DECAY_PERIOD = 90 days;
    uint256 public constant DECAY_RATE = 5; // 5% per period
    
    // Events
    event ReputationUpdated(address indexed user, uint8 newScore);
    event TradeRecorded(address indexed seller, address indexed buyer, uint256 volume);
    event DisputeRecorded(address indexed user, bool won);
    event ExternalScoreUpdated(address indexed user, address platform, uint8 score);
    
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Records a successful trade
     * @param _seller Seller address
     * @param _buyer Buyer address
     * @param _volume Trade volume
     */
    function recordSuccessfulTrade(
        address _seller,
        address _buyer,
        uint256 _volume
    ) external onlyRole(UPDATER_ROLE) {
        // Update seller reputation
        ReputationScore storage sellerRep = reputations[_seller];
        sellerRep.successfulTrades++;
        sellerRep.totalVolume += _volume;
        sellerRep.lastUpdate = block.timestamp;
        _updateTradingScore(_seller);
        
        // Update buyer reputation
        ReputationScore storage buyerRep = reputations[_buyer];
        buyerRep.successfulTrades++;
        buyerRep.totalVolume += _volume;
        buyerRep.lastUpdate = block.timestamp;
        _updateTradingScore(_buyer);
        
        // Update pairwise history
        PairwiseHistory storage history = pairwiseHistory[_seller][_buyer];
        history.trades++;
        history.volume += _volume;
        history.lastTrade = block.timestamp;
        
        emit TradeRecorded(_seller, _buyer, _volume);
    }
    
    /**
     * @dev Records a dispute outcome
     * @param _user User address
     * @param _won Whether user won the dispute
     */
    function recordDisputeOutcome(
        address _user,
        bool _won
    ) external onlyRole(UPDATER_ROLE) {
        ReputationScore storage userRep = reputations[_user];
        
        if (!_won) {
            userRep.disputesLost++;
        }
        userRep.disputesRaised++;
        userRep.lastUpdate = block.timestamp;
        
        _updateDisputeScore(_user);
        
        emit DisputeRecorded(_user, _won);
    }
    
    /**
     * @dev Updates external platform score
     * @param _user User address
     * @param _score External score (0-100)
     */
    function updateExternalScore(
        address _user,
        uint8 _score
    ) external onlyRole(PLATFORM_ROLE) {
        require(_score <= 100, "Invalid score");
        require(externalPlatforms[msg.sender].active, "Platform inactive");
        
        ReputationScore storage userRep = reputations[_user];
        
        // Weighted average with existing external scores
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        
        // Add new score
        weightedSum = _score * externalPlatforms[msg.sender].weight;
        totalWeight = externalPlatforms[msg.sender].weight;
        
        // Average with existing if present
        if (userRep.externalScore > 0) {
            weightedSum += userRep.externalScore * 50; // Default weight for existing
            totalWeight += 50;
        }
        
        userRep.externalScore = uint8(weightedSum / totalWeight);
        userRep.lastUpdate = block.timestamp;
        
        _calculateOverallScore(_user);
        
        emit ExternalScoreUpdated(_user, msg.sender, _score);
    }
    
    /**
     * @dev Updates trading score based on history
     */
    function _updateTradingScore(address _user) private {
        ReputationScore storage userRep = reputations[_user];
        
        // Base score from successful trades
        uint256 score = 50; // Start at neutral
        
        // Increase based on trade count
        if (userRep.successfulTrades > 0) {
            score += min(userRep.successfulTrades * 2, 30); // Max +30
        }
        
        // Increase based on volume (logarithmic)
        if (userRep.totalVolume > 0) {
            uint256 volumeScore = _log10(userRep.totalVolume / 1e18) * 5;
            score += min(volumeScore, 20); // Max +20
        }
        
        userRep.tradingScore = uint8(min(score, 100));
        _calculateOverallScore(_user);
    }
    
    /**
     * @dev Updates dispute score based on history
     */
    function _updateDisputeScore(address _user) private {
        ReputationScore storage userRep = reputations[_user];
        
        uint256 score = 100; // Start at max
        
        // Decrease based on disputes
        if (userRep.disputesRaised > 0) {
            uint256 lossRate = (userRep.disputesLost * 100) / userRep.disputesRaised;
            score = score - min(lossRate, 50); // Max -50
        }
        
        // Additional penalty for high dispute frequency
        if (userRep.successfulTrades > 0) {
            uint256 disputeRate = (userRep.disputesRaised * 100) / 
                                 (userRep.successfulTrades + userRep.disputesRaised);
            if (disputeRate > 10) {
                score = score - min(disputeRate - 10, 30); // Max -30
            }
        }
        
        userRep.disputeScore = uint8(score);
        _calculateOverallScore(_user);
    }
    
    /**
     * @dev Calculates overall reputation score
     */
    function _calculateOverallScore(address _user) private {
        ReputationScore storage userRep = reputations[_user];
        
        // Apply time decay
        uint256 timeSinceUpdate = block.timestamp - userRep.lastUpdate;
        uint256 decayPeriods = timeSinceUpdate / DECAY_PERIOD;
        
        if (decayPeriods > 0) {
            uint256 decayFactor = 100 - (decayPeriods * DECAY_RATE);
            userRep.tradingScore = uint8((userRep.tradingScore * decayFactor) / 100);
            userRep.disputeScore = uint8((userRep.disputeScore * decayFactor) / 100);
        }
        
        // Calculate weighted average
        uint256 totalScore = 
            (userRep.tradingScore * 40) +      // 40% weight
            (userRep.disputeScore * 30) +      // 30% weight
            (userRep.verificationScore * 20) + // 20% weight
            (userRep.externalScore * 10);      // 10% weight
        
        uint8 overallScore = uint8(totalScore / 100);
        
        emit ReputationUpdated(_user, overallScore);
    }
    
    /**
     * @dev Gets user reputation
     * @param _user User address
     * @return score Overall reputation score
     * @return lastUpdate Last update timestamp
     */
    function getReputation(address _user) external view returns (
        uint8 score,
        uint256 lastUpdate
    ) {
        ReputationScore memory userRep = reputations[_user];
        
        uint256 totalScore = 
            (userRep.tradingScore * 40) +
            (userRep.disputeScore * 30) +
            (userRep.verificationScore * 20) +
            (userRep.externalScore * 10);
        
        return (uint8(totalScore / 100), userRep.lastUpdate);
    }
    
    /**
     * @dev Gets detailed reputation breakdown
     */
    function getDetailedReputation(address _user) external view returns (
        uint8 trading,
        uint8 dispute,
        uint8 verification,
        uint8 external,
        uint256 volume,
        uint256 trades
    ) {
        ReputationScore memory userRep = reputations[_user];
        return (
            userRep.tradingScore,
            userRep.disputeScore,
            userRep.verificationScore,
            userRep.externalScore,
            userRep.totalVolume,
            userRep.successfulTrades
        );
    }
    
    /**
     * @dev Gets pairwise trading history
     */
    function getPairwiseHistory(
        address _party1,
        address _party2
    ) external view returns (
        uint256 trades,
        uint256 volume,
        uint256 disputes
    ) {
        PairwiseHistory memory history = pairwiseHistory[_party1][_party2];
        return (history.trades, history.volume, history.disputes);
    }
    
    /**
     * @dev Gets dispute count for user
     */
    function getDisputeCount(address _user) external view returns (uint256) {
        return reputations[_user].disputesRaised;
    }
    
    /**
     * @dev Adds external platform
     */
    function addExternalPlatform(
        address _platform,
        string calldata _name,
        uint8 _weight
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_weight > 0 && _weight <= 100, "Invalid weight");
        
        externalPlatforms[_platform] = ExternalPlatform({
            name: _name,
            weight: _weight,
            active: true
        });
        
        platformList.push(_platform);
        _setupRole(PLATFORM_ROLE, _platform);
    }
    
    // Helper functions
    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
    
    function _log10(uint256 value) private pure returns (uint256) {
        uint256 result = 0;
        while (value >= 10) {
            value /= 10;
            result++;
        }
        return result;
    }
}
```

### 4.5 EmergencyModule Contract

Handles emergency situations and panic mode activations.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract EmergencyModule is AccessControl {
    bytes32 public constant RESPONDER_ROLE = keccak256("RESPONDER_ROLE");
    bytes32 public constant MONITOR_ROLE = keccak256("MONITOR_ROLE");
    
    // Structs
    struct EmergencyEvent {
        address escrow;
        address seller;
        address buyer;
        uint256 timestamp;
        uint256 extensionPeriod;
        string emergencyType;
        bool resolved;
        address responder;
    }
    
    struct UserEmergencyProfile {
        uint256 totalActivations;
        uint256 falseActivations;
        uint256 lastActivation;
        bool blacklisted;
    }
    
    // State Variables
    mapping(uint256 => EmergencyEvent) public emergencies;
    mapping(address => UserEmergencyProfile) public userProfiles;
    mapping(address => uint256[]) public userEmergencies;
    uint256 public emergencyCounter;
    
    // Configuration
    uint256 public constant MAX_FALSE_ACTIVATIONS = 3;
    uint256 public constant BLACKLIST_PERIOD = 30 days;
    uint256 public constant PATTERN_DETECTION_WINDOW = 7 days;
    
    // Pattern Detection
    mapping(address => uint256[]) private recentActivations;
    
    // Events
    event EmergencyActivated(
        uint256 indexed emergencyId,
        address indexed escrow,
        address activator
    );
    event EmergencyResolved(
        uint256 indexed emergencyId,
        bool wasFalseAlarm
    );
    event UserBlacklisted(address indexed user, uint256 until);
    event SuspiciousPattern(address indexed user, string pattern);
    
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @dev Handles emergency activation from escrow
     * @param _escrow Escrow address
     * @param _seller Seller address
     * @param _buyer Buyer address
     */
    function handleEmergency(
        address _escrow,
        address _seller,
        address _buyer
    ) external returns (uint256 emergencyId) {
        // Verify caller is valid escrow
        require(
            IEscrowFactory(msg.sender).isValidEscrow(_escrow),
            "Invalid escrow"
        );
        
        // Check if user is blacklisted
        address activator = tx.origin; // Get actual user
        require(!userProfiles[activator].blacklisted, "User blacklisted");
        
        emergencyId = ++emergencyCounter;
        
        emergencies[emergencyId] = EmergencyEvent({
            escrow: _escrow,
            seller: _seller,
            buyer: _buyer,
            timestamp: block.timestamp,
            extensionPeriod: 72 hours,
            emergencyType: "PANIC_ACTIVATION",
            resolved: false,
            responder: address(0)
        });
        
        // Update user profile
        UserEmergencyProfile storage profile = userProfiles[activator];
        profile.totalActivations++;
        profile.lastActivation = block.timestamp;
        
        userEmergencies[activator].push(emergencyId);
        userEmergencies[_seller].push(emergencyId);
        userEmergencies[_buyer].push(emergencyId);
        
        // Pattern detection
        _detectPatterns(activator);
        
        // Alert responders
        emit EmergencyActivated(emergencyId, _escrow, activator);
        
        return emergencyId;
    }
    
    /**
     * @dev Responder reviews and resolves emergency
     * @param _emergencyId Emergency ID
     * @param _wasFalseAlarm Whether it was a false alarm
     * @param _notes Resolution notes
     */
    function resolveEmergency(
        uint256 _emergencyId,
        bool _wasFalseAlarm,
        string calldata _notes
    ) external onlyRole(RESPONDER_ROLE) {
        EmergencyEvent storage emergency = emergencies[_emergencyId];
        require(!emergency.resolved, "Already resolved");
        
        emergency.resolved = true;
        emergency.responder = msg.sender;
        
        if (_wasFalseAlarm) {
            // Identify the activator
            address activator = _findActivator(_emergencyId);
            UserEmergencyProfile storage profile = userProfiles[activator];
            
            profile.falseActivations++;
            
            // Check if should blacklist
            if (profile.falseActivations >= MAX_FALSE_ACTIVATIONS) {
                profile.blacklisted = true;
                emit UserBlacklisted(activator, block.timestamp + BLACKLIST_PERIOD);
            }
        }
        
        emit EmergencyResolved(_emergencyId, _wasFalseAlarm);
    }
    
    /**
     * @dev Detects suspicious activation patterns
     */
    function _detectPatterns(address _user) private {
        uint256[] storage activations = recentActivations[_user];
        activations.push(block.timestamp);
        
        // Remove old activations
        uint256 cutoff = block.timestamp - PATTERN_DETECTION_WINDOW;
        uint256 writeIndex = 0;
        for (uint256 i = 0; i < activations.length; i++) {
            if (activations[i] >= cutoff) {
                if (i != writeIndex) {
                    activations[writeIndex] = activations[i];
                }
                writeIndex++;
            }
        }
        
        // Resize array
        while (activations.length > writeIndex) {
            activations.pop();
        }
        
        // Pattern detection logic
        if (activations.length >= 3) {
            // Check for rapid activations
            uint256 avgInterval = (activations[activations.length - 1] - activations[0]) / 
                                 (activations.length - 1);
            
            if (avgInterval < 1 hours) {
                emit SuspiciousPattern(_user, "RAPID_ACTIVATIONS");
            }
        }
        
        // Check for pattern with specific sellers
        uint256[] memory userEmergencyList = userEmergencies[_user];
        if (userEmergencyList.length >= 3) {
            mapping(address => uint256) storage sellerCount;
            
            for (uint256 i = 0; i < userEmergencyList.length; i++) {
                address seller = emergencies[userEmergencyList[i]].seller;
                sellerCount[seller]++;
                
                if (sellerCount[seller] >= 3) {
                    emit SuspiciousPattern(_user, "REPEATED_SELLER");
                }
            }
        }
    }
    
    /**
     * @dev Finds the activator of an emergency
     */
    function _findActivator(uint256 _emergencyId) private view returns (address) {
        EmergencyEvent memory emergency = emergencies[_emergencyId];
        
        // Check buyer's recent emergencies
        uint256[] memory buyerEmergencies = userEmergencies[emergency.buyer];
        for (uint256 i = buyerEmergencies.length; i > 0; i--) {
            if (buyerEmergencies[i - 1] == _emergencyId) {
                return emergency.buyer;
            }
        }
        
        return emergency.seller;
    }
    
    /**
     * @dev Gets emergency details
     */
    function getEmergencyDetails(uint256 _emergencyId) external view returns (
        address escrow,
        address seller,
        address buyer,
        uint256 timestamp,
        bool resolved
    ) {
        EmergencyEvent memory emergency = emergencies[_emergencyId];
        return (
            emergency.escrow,
            emergency.seller,
            emergency.buyer,
            emergency.timestamp,
            emergency.resolved
        );
    }
    
    /**
     * @dev Gets user emergency profile
     */
    function getUserProfile(address _user) external view returns (
        uint256 totalActivations,
        uint256 falseActivations,
        bool blacklisted
    ) {
        UserEmergencyProfile memory profile = userProfiles[_user];
        return (
            profile.totalActivations,
            profile.falseActivations,
            profile.blacklisted
        );
    }
    
    /**
     * @dev Monitors for anomalies
     */
    function monitorAnomalies() external onlyRole(MONITOR_ROLE) {
        // Implementation would include:
        // - Cross-reference with reputation scores
        // - Check for coordinated attacks
        // - Analyze geographical patterns
        // - Machine learning integration
    }
    
    /**
     * @dev Removes blacklist after period expires
     */
    function removeBlacklist(address _user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        UserEmergencyProfile storage profile = userProfiles[_user];
        require(profile.blacklisted, "Not blacklisted");
        require(
            block.timestamp > profile.lastActivation + BLACKLIST_PERIOD,
            "Period not expired"
        );
        
        profile.blacklisted = false;
        profile.falseActivations = 0;
    }
}
```

---

## 5. Integration Contracts

### 5.1 1inch Integration

Integrates 1inch protocols for optimal payment routing and cross-chain swaps.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface I1inchAggregationRouterV5 {
    function swap(
        address executor,
        SwapDescription calldata desc,
        bytes calldata permit,
        bytes calldata data
    ) external payable returns (uint256 returnAmount, uint256 spentAmount);
}

interface I1inchFusionSDK {
    function placeLimitOrder(
        LimitOrderData calldata order
    ) external returns (bytes32 orderHash);
}

contract OneInchIntegration is Ownable, ReentrancyGuard {
    // 1inch Contract References
    I1inchAggregationRouterV5 public constant AGGREGATION_ROUTER = 
        I1inchAggregationRouterV5(0x1111111254EEB25477B68fb85Ed929f73A960582);
    
    // Structs
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address payable srcReceiver;
        address payable dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
    }
    
    struct LimitOrderData {
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
        bytes interactions;
    }
    
    struct OptimalRoute {
        address[] tokens;
        uint256[] amounts;
        address[] pools;
        uint256 expectedReturn;
        uint256 gasEstimate;
    }
    
    // State Variables
    mapping(address => bool) public authorizedCallers;
    mapping(bytes32 => OptimalRoute) public routeCache;
    uint256 public routeCacheDuration = 5 minutes;
    mapping(bytes32 => uint256) public routeCacheTimestamp;
    
    // Events
    event SwapExecuted(
        address indexed user,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount
    );
    event RouteCalculated(
        address srcToken,
        address dstToken,
        uint256 amount,
        uint256 expectedReturn
    );
    event LimitOrderPlaced(
        address indexed maker,
        bytes32 orderHash,
        address makerAsset,
        address takerAsset
    );
    
    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "Not authorized");
        _;
    }
    
    constructor() {
        authorizedCallers[msg.sender] = true;
    }
    
    /**
     * @dev Executes optimized swap for escrow funding
     * @param _srcToken Source token address
     * @param _dstToken Destination token address
     * @param _amount Amount to swap
     * @param _minReturn Minimum return amount
     * @param _receiver Receiver address
     * @param _swapData 1inch swap data
     */
    function executeOptimalSwap(
        address _srcToken,
        address _dstToken,
        uint256 _amount,
        uint256 _minReturn,
        address _receiver,
        bytes calldata _swapData
    ) external payable nonReentrant onlyAuthorized returns (uint256 returnAmount) {
        // Prepare swap description
        SwapDescription memory desc = SwapDescription({
            srcToken: _srcToken,
            dstToken: _dstToken,
            srcReceiver: payable(address(this)),
            dstReceiver: payable(_receiver),
            amount: _amount,
            minReturnAmount: _minReturn,
            flags: 0
        });
        
        // Execute swap
        (returnAmount,) = AGGREGATION_ROUTER.swap{value: msg.value}(
            address(this), // executor
            desc,
            "", // no permit needed
            _swapData
        );
        
        emit SwapExecuted(
            msg.sender,
            _srcToken,
            _dstToken,
            _amount,
            returnAmount
        );
        
        return returnAmount;
    }
    
    /**
     * @dev Calculates optimal route for swap
     * @param _srcToken Source token
     * @param _dstToken Destination token
     * @param _amount Amount to swap
     * @return route Optimal route details
     */
    function calculateOptimalRoute(
        address _srcToken,
        address _dstToken,
        uint256 _amount
    ) external view returns (OptimalRoute memory route) {
        bytes32 routeKey = keccak256(abi.encodePacked(_srcToken, _dstToken, _amount));
        
        // Check cache
        if (routeCacheTimestamp[routeKey] + routeCacheDuration > block.timestamp) {
            return routeCache[routeKey];
        }
        
        // In production, this would call 1inch API
        // For now, return mock data
        route = OptimalRoute({
            tokens: new address[](2),
            amounts: new uint256[](2),
            pools: new address[](1),
            expectedReturn: (_amount * 995) / 1000, // 0.5% slippage
            gasEstimate: 150000
        });
        
        route.tokens[0] = _srcToken;
        route.tokens[1] = _dstToken;
        route.amounts[0] = _amount;
        route.amounts[1] = route.expectedReturn;
        
        return route;
    }
    
    /**
     * @dev Places limit order for P2P trading
     * @param _makerAsset Asset being sold
     * @param _takerAsset Asset being bought
     * @param _makingAmount Amount being sold
     * @param _takingAmount Amount being bought
     * @param _interactions Order interactions
     */
    function placeLimitOrder(
        address _makerAsset,
        address _takerAsset,
        uint256 _makingAmount,
        uint256 _takingAmount,
        bytes calldata _interactions
    ) external nonReentrant returns (bytes32 orderHash) {
        LimitOrderData memory orderData = LimitOrderData({
            makerAsset: _makerAsset,
            takerAsset: _takerAsset,
            maker: msg.sender,
            receiver: msg.sender,
            allowedSender: address(0), // any sender
            makingAmount: _makingAmount,
            takingAmount: _takingAmount,
            offsets: 0,
            interactions: _interactions
        });
        
        // In production, this would interact with 1inch Limit Order Protocol
        orderHash = keccak256(abi.encode(orderData));
        
        emit LimitOrderPlaced(
            msg.sender,
            orderHash,
            _makerAsset,
            _takerAsset
        );
        
        return orderHash;
    }
    
    /**
     * @dev Authorizes caller for swap execution
     */
    function authorizeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = true;
    }
    
    /**
     * @dev Revokes caller authorization
     */
    function revokeCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = false;
    }
    
    /**
     * @dev Updates route cache duration
     */
    function updateCacheDuration(uint256 _duration) external onlyOwner {
        require(_duration > 0 && _duration <= 1 hours, "Invalid duration");
        routeCacheDuration = _duration;
    }
}
```

### 5.2 Circle USDC/EURC Integration

Implements Circle's CCTP for cross-chain stablecoin transfers.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);
}

interface IMessageTransmitter {
    function receiveMessage(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (bool success);
}

contract CircleIntegration is Ownable {
    // Circle Contract References
    ITokenMessenger public immutable TOKEN_MESSENGER;
    IMessageTransmitter public immutable MESSAGE_TRANSMITTER;
    
    // Supported Tokens
    mapping(address => bool) public supportedTokens;
    mapping(uint32 => bool) public supportedDomains;
    
    // Chain Domain Mappings
    mapping(uint256 => uint32) public chainToDomain;
    
    // State Variables
    mapping(bytes32 => bool) public processedMessages;
    mapping(address => mapping(address => uint256)) public userBalances;
    
    // Events
    event CrossChainTransferInitiated(
        address indexed sender,
        uint256 amount,
        uint32 destinationDomain,
        bytes32 recipient
    );
    event CrossChainTransferReceived(
        bytes32 indexed recipient,
        uint256 amount,
        address token
    );
    event BalanceUnified(
        address indexed user,
        address[] tokens,
        uint256[] amounts
    );
    
    constructor(
        address _tokenMessenger,
        address _messageTransmitter
    ) {
        TOKEN_MESSENGER = ITokenMessenger(_tokenMessenger);
        MESSAGE_TRANSMITTER = IMessageTransmitter(_messageTransmitter);
        
        // Initialize supported tokens
        supportedTokens[0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48] = true; // USDC
        supportedTokens[0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c] = true; // EURC
        
        // Initialize chain domains
        chainToDomain[1] = 0; // Ethereum
        chainToDomain[137] = 7; // Polygon
        chainToDomain[42161] = 3; // Arbitrum
        chainToDomain[10] = 2; // Optimism
        chainToDomain[8453] = 6; // Base
        
        // Mark domains as supported
        supportedDomains[0] = true;
        supportedDomains[2] = true;
        supportedDomains[3] = true;
        supportedDomains[6] = true;
        supportedDomains[7] = true;
    }
    
    /**
     * @dev Initiates cross-chain transfer
     * @param _token Token address (USDC/EURC)
     * @param _amount Amount to transfer
     * @param _destinationChain Destination chain ID
     * @param _recipient Recipient address on destination
     */
    function initiateTransfer(
        address _token,
        uint256 _amount,
        uint256 _destinationChain,
        address _recipient
    ) external returns (uint64 nonce) {
        require(supportedTokens[_token], "Token not supported");
        
        uint32 destinationDomain = chainToDomain[_destinationChain];
        require(supportedDomains[destinationDomain], "Chain not supported");
        
        // Transfer tokens from user
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        
        // Approve token messenger
        IERC20(_token).approve(address(TOKEN_MESSENGER), _amount);
        
        // Convert recipient to bytes32
        bytes32 mintRecipient = bytes32(uint256(uint160(_recipient)));
        
        // Initiate cross-chain transfer
        nonce = TOKEN_MESSENGER.depositForBurn(
            _amount,
            destinationDomain,
            mintRecipient,
            _token
        );
        
        emit CrossChainTransferInitiated(
            msg.sender,
            _amount,
            destinationDomain,
            mintRecipient
        );
        
        return nonce;
    }
    
    /**
     * @dev Receives cross-chain transfer
     * @param _message Message bytes from source chain
     * @param _attestation Attestation from Circle
     */
    function receiveTransfer(
        bytes calldata _message,
        bytes calldata _attestation
    ) external {
        bytes32 messageHash = keccak256(_message);
        require(!processedMessages[messageHash], "Already processed");
        
        // Process message
        bool success = MESSAGE_TRANSMITTER.receiveMessage(_message, _attestation);
        require(success, "Message processing failed");
        
        processedMessages[messageHash] = true;
        
        // Decode message to get recipient and amount
        // In production, proper decoding would be implemented
        // For now, emit event
        emit CrossChainTransferReceived(messageHash, 0, address(0));
    }
    
    /**
     * @dev Gets unified balance across all supported tokens
     * @param _user User address
     * @return tokens Array of token addresses
     * @return balances Array of balances
     */
    function getUnifiedBalance(address _user) external view returns (
        address[] memory tokens,
        uint256[] memory balances
    ) {
        // Count supported tokens
        uint256 tokenCount = 2; // USDC and EURC
        
        tokens = new address[](tokenCount);
        balances = new uint256[](tokenCount);
        
        uint256 index = 0;
        
        // USDC
        address usdc = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
        if (supportedTokens[usdc]) {
            tokens[index] = usdc;
            balances[index] = IERC20(usdc).balanceOf(_user) + 
                             userBalances[_user][usdc];
            index++;
        }
        
        // EURC
        address eurc = 0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c;
        if (supportedTokens[eurc]) {
            tokens[index] = eurc;
            balances[index] = IERC20(eurc).balanceOf(_user) + 
                             userBalances[_user][eurc];
            index++;
        }
        
        return (tokens, balances);
    }
    
    /**
     * @dev Selects optimal chain for payment
     * @param _amount Payment amount
     * @param _token Token address
     * @return chainId Optimal chain ID
     * @return estimatedFee Estimated transaction fee
     */
    function selectOptimalChain(
        uint256 _amount,
        address _token
    ) external view returns (uint256 chainId, uint256 estimatedFee) {
        // In production, this would analyze:
        // - Current gas prices on each chain
        // - User's existing balances
        // - Bridge fees
        // - Transaction urgency
        
        // Mock implementation
        if (_amount < 100e6) { // < $100
            chainId = 137; // Polygon for small amounts
            estimatedFee = 0.1e6; // $0.10
        } else if (_amount < 10000e6) { // < $10,000
            chainId = 10; // Optimism for medium amounts
            estimatedFee = 0.5e6; // $0.50
        } else {
            chainId = 1; // Ethereum for large amounts
            estimatedFee = 5e6; // $5.00
        }
        
        return (chainId, estimatedFee);
    }
    
    /**
     * @dev Adds support for new token
     */
    function addSupportedToken(address _token) external onlyOwner {
        supportedTokens[_token] = true;
    }
    
    /**
     * @dev Adds support for new chain
     */
    function addSupportedChain(
        uint256 _chainId,
        uint32 _domain
    ) external onlyOwner {
        chainToDomain[_chainId] = _domain;
        supportedDomains[_domain] = true;
    }
}
```

### 5.3 LayerZero OFT Integration

Implements LayerZero OFT for cross-chain governance token.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@layerzerolabs/solidity-examples/contracts/token/oft/v2/OFTV2.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract HMTToken is OFTV2, Pausable {
    // Token Details
    string public constant NAME = "Hackers Market Token";
    string public constant SYMBOL = "HMT";
    uint8 public constant DECIMALS = 18;
    
    // Supply Management
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million
    
    // Vesting & Distribution
    mapping(address => VestingSchedule) public vestingSchedules;
    mapping(address => uint256) public stakingBalances;
    mapping(address => uint256) public stakingRewards;
    
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliffDuration;
        uint256 vestingDuration;
        uint256 releasedAmount;
    }
    
    // Governance
    mapping(address => uint256) public votingPower;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    
    // Events
    event TokensStaked(address indexed user, uint256 amount);
    event TokensUnstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event VestingScheduleCreated(address indexed beneficiary, uint256 amount);
    
    constructor(
        address _layerZeroEndpoint
    ) OFTV2(NAME, SYMBOL, _layerZeroEndpoint) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    /**
     * @dev Stakes tokens for governance participation
     * @param _amount Amount to stake
     */
    function stake(uint256 _amount) external whenNotPaused {
        require(_amount > 0, "Amount must be positive");
        require(balanceOf(msg.sender) >= _amount, "Insufficient balance");
        
        _transfer(msg.sender, address(this), _amount);
        
        stakingBalances[msg.sender] += _amount;
        votingPower[msg.sender] += _amount;
        
        emit TokensStaked(msg.sender, _amount);
    }
    
    /**
     * @dev Unstakes tokens
     * @param _amount Amount to unstake
     */
    function unstake(uint256 _amount) external {
        require(stakingBalances[msg.sender] >= _amount, "Insufficient stake");
        
        stakingBalances[msg.sender] -= _amount;
        votingPower[msg.sender] -= _amount;
        
        _transfer(address(this), msg.sender, _amount);
        
        emit TokensUnstaked(msg.sender, _amount);
    }
    
    /**
     * @dev Claims staking rewards
     */
    function claimRewards() external {
        uint256 rewards = calculateRewards(msg.sender);
        require(rewards > 0, "No rewards available");
        
        stakingRewards[msg.sender] = 0;
        _mint(msg.sender, rewards);
        
        emit RewardsClaimed(msg.sender, rewards);
    }
    
    /**
     * @dev Calculates pending rewards
     * @param _user User address
     * @return rewards Pending rewards
     */
    function calculateRewards(address _user) public view returns (uint256) {
        // Simplified reward calculation
        // In production: complex APY calculation based on stake duration
        uint256 stakedAmount = stakingBalances[_user];
        uint256 stakingDuration = 30 days; // Simplified
        uint256 apy = 10; // 10% APY
        
        return (stakedAmount * apy * stakingDuration) / (365 days * 100);
    }
    
    /**
     * @dev Creates vesting schedule
     * @param _beneficiary Beneficiary address
     * @param _amount Total vesting amount
     * @param _cliff Cliff duration
     * @param _duration Total vesting duration
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _amount,
        uint256 _cliff,
        uint256 _duration
    ) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary");
        require(_amount > 0, "Amount must be positive");
        require(_duration > _cliff, "Invalid durations");
        
        vestingSchedules[_beneficiary] = VestingSchedule({
            totalAmount: _amount,
            startTime: block.timestamp,
            cliffDuration: _cliff,
            vestingDuration: _duration,
            releasedAmount: 0
        });
        
        emit VestingScheduleCreated(_beneficiary, _amount);
    }
    
    /**
     * @dev Releases vested tokens
     */
    function releaseVested() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.totalAmount > 0, "No vesting schedule");
        
        uint256 vestedAmount = calculateVestedAmount(msg.sender);
        uint256 releasable = vestedAmount - schedule.releasedAmount;
        
        require(releasable > 0, "No tokens to release");
        
        schedule.releasedAmount += releasable;
        _transfer(address(this), msg.sender, releasable);
    }
    
    /**
     * @dev Calculates vested amount
     * @param _beneficiary Beneficiary address
     * @return amount Vested amount
     */
    function calculateVestedAmount(
        address _beneficiary
    ) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[_beneficiary];
        
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) {
            return 0;
        }
        
        if (block.timestamp >= schedule.startTime + schedule.vestingDuration) {
            return schedule.totalAmount;
        }
        
        uint256 timeElapsed = block.timestamp - schedule.startTime;
        return (schedule.totalAmount * timeElapsed) / schedule.vestingDuration;
    }
    
    /**
     * @dev Gets cross-chain voting power
     * @param _user User address
     * @param _chainIds Array of chain IDs to check
     * @return totalPower Total voting power across chains
     */
    function getCrossChainVotingPower(
        address _user,
        uint16[] calldata _chainIds
    ) external view returns (uint256 totalPower) {
        // Local chain voting power
        totalPower = votingPower[_user];
        
        // In production: query other chains via LayerZero
        // For now, return local power only
        return totalPower;
    }
    
    /**
     * @dev Pauses token transfers
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpauses token transfers
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Override _beforeTokenTransfer to add pause functionality
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}
```

---

## 6. Security Mechanisms

### 6.1 Time-Lock Protection
- Dynamic calculation based on risk factors
- Minimum 1-hour lock for all transactions
- Maximum 7-day lock for high-risk scenarios
- Emergency extensions up to 72 hours

### 6.2 Multi-Signature Requirements
- Critical functions require multi-sig approval
- Time-delayed execution for admin functions
- Role-based access control (RBAC)

### 6.3 Emergency Response
- Panic button with hash verification
- Pattern detection for abuse prevention
- Automated alerts to security team
- Blacklist mechanism for repeat offenders

### 6.4 Audit Requirements
- Formal verification of critical functions
- Multiple independent security audits
- Bug bounty program
- Continuous monitoring and updates

---

## 7. Deployment Strategy

### 7.1 Deployment Order
1. Deploy infrastructure modules
2. Deploy factory contract
3. Deploy integration contracts
4. Configure module references
5. Deploy governance token
6. Initialize cross-chain infrastructure

### 7.2 Network Configuration

```javascript
// Deployment Configuration
const networks = {
  polygon: {
    chainId: 137,
    rpc: "https://polygon-rpc.com",
    contracts: {
      factory: "0x...",
      kyc: "0x...",
      timeLock: "0x...",
      dispute: "0x...",
      reputation: "0x...",
      emergency: "0x..."
    }
  },
  ethereum: {
    chainId: 1,
    contracts: { /* ... */ }
  },
  arbitrum: {
    chainId: 42161,
    contracts: { /* ... */ }
  }
};
```

### 7.3 Gas Optimization Strategies
- Use CREATE2 for deterministic addresses
- Implement efficient storage patterns
- Batch operations where possible
- Use events instead of storage for logs

---

## 8. Testing & Auditing

### 8.1 Test Coverage Requirements
- 100% line coverage for critical functions
- 95%+ branch coverage
- Fuzzing tests for edge cases
- Integration tests for all modules

### 8.2 Security Audit Checklist
- [ ] Reentrancy protection
- [ ] Integer overflow/underflow
- [ ] Access control verification
- [ ] Front-running protection
- [ ] Gas optimization
- [ ] Emergency pause functionality
- [ ] Upgrade mechanism security

### 8.3 Testing Framework

```javascript
// Example Test Structure
describe("EscrowFactory", () => {
  describe("createEscrow", () => {
    it("should deploy minimal proxy", async () => {
      // Test implementation
    });
    
    it("should initialize with correct parameters", async () => {
      // Test implementation
    });
    
    it("should revert on invalid parameters", async () => {
      // Test implementation
    });
  });
});
```

---

## 9. Gas Optimization

### 9.1 Storage Optimization
- Pack struct variables efficiently
- Use mappings instead of arrays where possible
- Minimize storage operations
- Use immutable and constant appropriately

### 9.2 Computation Optimization
- Cache frequently accessed values
- Minimize external calls
- Use assembly for critical operations
- Implement circuit breakers

### 9.3 Deployment Optimization
- Use minimal proxy pattern
- Deploy implementation once
- Share infrastructure modules
- Optimize bytecode size

---

## 10. Upgrade Patterns

### 10.1 Module Upgrades
- Each module independently upgradeable
- No fund custody in upgradeable contracts
- Time-locked upgrade process
- Community governance approval

### 10.2 Emergency Upgrades
- Multi-sig controlled emergency pause
- 48-hour time-lock for emergency upgrades
- Automatic notification to all users
- Rollback capability

### 10.3 Migration Strategy
- Graceful migration paths
- User-initiated migrations
- Backward compatibility maintenance
- Data preservation guarantees

---

## 11. Hardhat Development Environment

### 11.1 Project Setup

#### 11.1.1 Initialize Hardhat Project

```bash
# Create project directory
mkdir hackers-market-contracts
cd hackers-market-contracts

# Initialize npm project
npm init -y

# Install Hardhat and dependencies
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install --save-dev @openzeppelin/contracts @openzeppelin/contracts-upgradeable
npm install --save-dev @layerzerolabs/solidity-examples
npm install --save-dev dotenv

# Initialize Hardhat
npx hardhat init
```

#### 11.1.2 Project Structure

```
hackers-market-contracts/
├── contracts/
│   ├── core/
│   │   ├── EscrowFactory.sol
│   │   └── EscrowImplementation.sol
│   ├── modules/
│   │   ├── KYCModule.sol
│   │   ├── TimeLockModule.sol
│   │   ├── DisputeResolver.sol
│   │   ├── ReputationOracle.sol
│   │   └── EmergencyModule.sol
│   ├── integrations/
│   │   ├── OneInchIntegration.sol
│   │   ├── CircleIntegration.sol
│   │   └── HMTToken.sol
│   ├── interfaces/
│   │   ├── IEscrowFactory.sol
│   │   ├── IEscrowImplementation.sol
│   │   └── IModules.sol
│   └── mocks/
│       ├── MockERC20.sol
│       ├── Mock1inch.sol
│       └── MockCircle.sol
├── scripts/
│   ├── deploy/
│   │   ├── 01-deploy-modules.js
│   │   ├── 02-deploy-factory.js
│   │   ├── 03-deploy-integrations.js
│   │   └── 04-verify-contracts.js
│   └── utils/
│       ├── addresses.js
│       └── helpers.js
├── test/
│   ├── unit/
│   │   ├── EscrowFactory.test.js
│   │   ├── EscrowImplementation.test.js
│   │   └── Modules.test.js
│   ├── integration/
│   │   ├── FullFlow.test.js
│   │   └── CrossChain.test.js
│   └── helpers/
│       ├── fixtures.js
│       └── constants.js
├── tasks/
│   ├── accounts.js
│   ├── verify.js
│   └── interact.js
├── hardhat.config.js
├── .env.example
├── .gitignore
└── package.json
```

### 11.2 Hardhat Configuration

#### 11.2.1 hardhat.config.js

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

// Import tasks
require("./tasks/accounts");
require("./tasks/verify");
require("./tasks/interact");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";
const OPTIMISM_API_KEY = process.env.OPTIMISM_API_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true,
          yulDetails: {
            stackAllocation: true,
            optimizerSteps: "dhfoDgvulfnTUtnIf"
          }
        }
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: {
        url: process.env.POLYGON_RPC_URL || "",
        blockNumber: 45000000 // Pin to specific block for testing consistency
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 137,
      gasPrice: 100000000000 // 100 gwei
    },
    polygonMumbai: {
      url: process.env.MUMBAI_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 80001,
      gasPrice: 20000000000 // 20 gwei
    },
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 1
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 42161
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 10
    },
    base: {
      url: process.env.BASE_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 8453
    },
    etherlink: {
      url: process.env.ETHERLINK_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      chainId: 128123 // Etherlink testnet
    }
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY,
      optimisticEthereum: OPTIMISM_API_KEY,
      base: process.env.BASESCAN_API_KEY || ""
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    outputFile: "gas-report.txt",
    noColors: true
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 200000 // 200 seconds
  }
};
```

#### 11.2.2 .env.example

```bash
# Private Keys
PRIVATE_KEY=your_private_key_here
DEPLOYER_PRIVATE_KEY=your_deployer_private_key_here

# RPC URLs
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-api-key
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your-api-key
MUMBAI_RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/your-api-key
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/your-api-key
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/your-api-key
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your-api-key
ETHERLINK_RPC_URL=https://node.ghostnet.etherlink.com

# API Keys for Verification
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
ARBISCAN_API_KEY=your_arbiscan_api_key
OPTIMISM_API_KEY=your_optimism_api_key
BASESCAN_API_KEY=your_basescan_api_key

# Gas Reporter
REPORT_GAS=true
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key

# Contract Addresses (filled after deployment)
FACTORY_ADDRESS=
KYC_MODULE_ADDRESS=
TIMELOCK_MODULE_ADDRESS=
DISPUTE_MODULE_ADDRESS=
REPUTATION_MODULE_ADDRESS=
EMERGENCY_MODULE_ADDRESS=

# Integration Addresses
ONEINCH_INTEGRATION_ADDRESS=
CIRCLE_INTEGRATION_ADDRESS=
HMT_TOKEN_ADDRESS=

# External Contract Addresses
USDC_ADDRESS_POLYGON=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
EURC_ADDRESS_POLYGON=0xE111178A87A3BFf0c8d18DECBa5798827539Ae99
LAYERZERO_ENDPOINT_POLYGON=0x3c2269811836af69497E5F486A85D7316753cf62
```

### 11.3 Deployment Scripts

#### 11.3.1 Deploy Modules Script

```javascript
// scripts/deploy/01-deploy-modules.js
const { ethers, upgrades, network } = require("hardhat");
const { saveAddress, getAddress } = require("../utils/addresses");

async function main() {
  console.log(`Deploying to ${network.name}...`);
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy KYCModule
  console.log("\n1. Deploying KYCModule...");
  const KYCModule = await ethers.getContractFactory("KYCModule");
  const kycModule = await KYCModule.deploy();
  await kycModule.deployed();
  console.log("KYCModule deployed to:", kycModule.address);
  await saveAddress(network.name, "KYCModule", kycModule.address);

  // Deploy ReputationOracle
  console.log("\n2. Deploying ReputationOracle...");
  const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
  const reputationOracle = await ReputationOracle.deploy();
  await reputationOracle.deployed();
  console.log("ReputationOracle deployed to:", reputationOracle.address);
  await saveAddress(network.name, "ReputationOracle", reputationOracle.address);

  // Deploy TimeLockModule
  console.log("\n3. Deploying TimeLockModule...");
  const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
  const timeLockModule = await TimeLockModule.deploy(
    reputationOracle.address,
    kycModule.address
  );
  await timeLockModule.deployed();
  console.log("TimeLockModule deployed to:", timeLockModule.address);
  await saveAddress(network.name, "TimeLockModule", timeLockModule.address);

  // Deploy DisputeResolver
  console.log("\n4. Deploying DisputeResolver...");
  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy();
  await disputeResolver.deployed();
  console.log("DisputeResolver deployed to:", disputeResolver.address);
  await saveAddress(network.name, "DisputeResolver", disputeResolver.address);

  // Deploy EmergencyModule
  console.log("\n5. Deploying EmergencyModule...");
  const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
  const emergencyModule = await EmergencyModule.deploy();
  await emergencyModule.deployed();
  console.log("EmergencyModule deployed to:", emergencyModule.address);
  await saveAddress(network.name, "EmergencyModule", emergencyModule.address);

  // Setup roles and permissions
  console.log("\n6. Setting up roles and permissions...");
  
  // Grant UPDATER_ROLE to DisputeResolver for ReputationOracle
  const UPDATER_ROLE = await reputationOracle.UPDATER_ROLE();
  await reputationOracle.grantRole(UPDATER_ROLE, disputeResolver.address);
  console.log("Granted UPDATER_ROLE to DisputeResolver");

  // Add initial DID providers to KYCModule
  console.log("\n7. Adding DID providers...");
  const providers = [
    { name: "ENS", weight: 20 },
    { name: "Lens", weight: 20 },
    { name: "WorldID", weight: 30 },
    { name: "BrightID", weight: 15 },
    { name: "Gitcoin Passport", weight: 15 }
  ];

  for (const provider of providers) {
    // In production, use actual provider addresses
    const providerAddress = ethers.Wallet.createRandom().address;
    await kycModule.addProvider(providerAddress, provider.name, provider.weight);
    console.log(`Added ${provider.name} provider`);
  }

  console.log("\nModule deployment completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

#### 11.3.2 Deploy Factory Script

```javascript
// scripts/deploy/02-deploy-factory.js
const { ethers, network } = require("hardhat");
const { saveAddress, getAddress } = require("../utils/addresses");

async function main() {
  console.log(`Deploying Factory to ${network.name}...`);
  
  const [deployer] = await ethers.getSigners();
  
  // Get module addresses
  const kycModule = await getAddress(network.name, "KYCModule");
  const timeLockModule = await getAddress(network.name, "TimeLockModule");
  const disputeResolver = await getAddress(network.name, "DisputeResolver");
  const reputationOracle = await getAddress(network.name, "ReputationOracle");
  const emergencyModule = await getAddress(network.name, "EmergencyModule");

  // Deploy EscrowImplementation
  console.log("\n1. Deploying EscrowImplementation...");
  const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
  const implementation = await EscrowImplementation.deploy();
  await implementation.deployed();
  console.log("EscrowImplementation deployed to:", implementation.address);
  await saveAddress(network.name, "EscrowImplementation", implementation.address);

  // Deploy EscrowFactory
  console.log("\n2. Deploying EscrowFactory...");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = await EscrowFactory.deploy(implementation.address);
  await factory.deployed();
  console.log("EscrowFactory deployed to:", factory.address);
  await saveAddress(network.name, "EscrowFactory", factory.address);

  // Configure factory
  console.log("\n3. Configuring factory modules...");
  await factory.updateModule("KYC", kycModule);
  await factory.updateModule("TimeLock", timeLockModule);
  await factory.updateModule("Dispute", disputeResolver);
  await factory.updateModule("Reputation", reputationOracle);
  await factory.updateModule("Emergency", emergencyModule);
  console.log("Factory modules configured");

  // Grant factory permissions on modules
  console.log("\n4. Granting factory permissions...");
  
  // Grant UPDATER_ROLE to factory on ReputationOracle
  const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
  const repOracle = ReputationOracle.attach(reputationOracle);
  const UPDATER_ROLE = await repOracle.UPDATER_ROLE();
  await repOracle.grantRole(UPDATER_ROLE, factory.address);
  
  console.log("Factory permissions granted");
  console.log("\nFactory deployment completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 11.4 Testing Framework

#### 11.4.1 Test Helpers

```javascript
// test/helpers/fixtures.js
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, seller, buyer, arbitrator, juror1, juror2, juror3] = 
    await ethers.getSigners();

  // Deploy all contracts
  const KYCModule = await ethers.getContractFactory("KYCModule");
  const kycModule = await KYCModule.deploy();

  const ReputationOracle = await ethers.getContractFactory("ReputationOracle");
  const reputationOracle = await ReputationOracle.deploy();

  const TimeLockModule = await ethers.getContractFactory("TimeLockModule");
  const timeLockModule = await TimeLockModule.deploy(
    reputationOracle.address,
    kycModule.address
  );

  const DisputeResolver = await ethers.getContractFactory("DisputeResolver");
  const disputeResolver = await DisputeResolver.deploy();

  const EmergencyModule = await ethers.getContractFactory("EmergencyModule");
  const emergencyModule = await EmergencyModule.deploy();

  const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
  const implementation = await EscrowImplementation.deploy();

  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = await EscrowFactory.deploy(implementation.address);

  // Configure factory
  await factory.updateModule("KYC", kycModule.address);
  await factory.updateModule("TimeLock", timeLockModule.address);
  await factory.updateModule("Dispute", disputeResolver.address);
  await factory.updateModule("Reputation", reputationOracle.address);
  await factory.updateModule("Emergency", emergencyModule.address);

  // Setup roles
  const UPDATER_ROLE = await reputationOracle.UPDATER_ROLE();
  await reputationOracle.grantRole(UPDATER_ROLE, factory.address);
  await reputationOracle.grantRole(UPDATER_ROLE, disputeResolver.address);

  const ARBITRATOR_ROLE = await disputeResolver.ARBITRATOR_ROLE();
  await disputeResolver.grantRole(ARBITRATOR_ROLE, arbitrator.address);

  const JURY_ROLE = await disputeResolver.JURY_ROLE();
  await disputeResolver.grantRole(JURY_ROLE, juror1.address);
  await disputeResolver.grantRole(JURY_ROLE, juror2.address);
  await disputeResolver.grantRole(JURY_ROLE, juror3.address);

  // Deploy mock tokens
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  const eurc = await MockERC20.deploy("Euro Coin", "EURC", 6);

  return {
    owner,
    seller,
    buyer,
    arbitrator,
    jurors: [juror1, juror2, juror3],
    contracts: {
      factory,
      implementation,
      kycModule,
      timeLockModule,
      disputeResolver,
      reputationOracle,
      emergencyModule,
      usdc,
      eurc
    }
  };
}

module.exports = {
  deployFixture
};
```

#### 11.4.2 Unit Test Example

```javascript
// test/unit/EscrowFactory.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployFixture } = require("../helpers/fixtures");

describe("EscrowFactory", function () {
  describe("Deployment", function () {
    it("Should set the correct implementation address", async function () {
      const { contracts } = await loadFixture(deployFixture);
      expect(await contracts.factory.escrowImplementation()).to.equal(
        contracts.implementation.address
      );
    });

    it("Should set the correct owner", async function () {
      const { owner, contracts } = await loadFixture(deployFixture);
      expect(await contracts.factory.owner()).to.equal(owner.address);
    });

    it("Should have all modules configured", async function () {
      const { contracts } = await loadFixture(deployFixture);
      const modules = await contracts.factory.getModules();
      
      expect(modules._kyc).to.equal(contracts.kycModule.address);
      expect(modules._timeLock).to.equal(contracts.timeLockModule.address);
      expect(modules._dispute).to.equal(contracts.disputeResolver.address);
      expect(modules._reputation).to.equal(contracts.reputationOracle.address);
      expect(modules._emergency).to.equal(contracts.emergencyModule.address);
    });
  });

  describe("Create Escrow", function () {
    it("Should create escrow with ETH payment", async function () {
      const { seller, contracts } = await loadFixture(deployFixture);
      
      const price = ethers.utils.parseEther("1.0");
      const itemHash = ethers.utils.id("test-item");
      const deliveryMethod = 0; // InPerson
      const customTimeLock = 0; // Use default
      
      const tx = await contracts.factory.connect(seller).createEscrow(
        price,
        ethers.constants.AddressZero, // ETH payment
        itemHash,
        deliveryMethod,
        customTimeLock
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === "EscrowCreated");
      
      expect(event).to.not.be.undefined;
      expect(event.args.seller).to.equal(seller.address);
      expect(event.args.price).to.equal(price);
      expect(event.args.itemHash).to.equal(itemHash);
      
      // Verify escrow is tracked
      const escrows = await contracts.factory.getSellerEscrows(seller.address);
      expect(escrows.length).to.equal(1);
      expect(await contracts.factory.isValidEscrow(escrows[0])).to.be.true;
    });

    it("Should create escrow with ERC20 payment", async function () {
      const { seller, contracts } = await loadFixture(deployFixture);
      
      const price = ethers.utils.parseUnits("100", 6); // 100 USDC
      const itemHash = ethers.utils.id("test-item-usdc");
      const deliveryMethod = 1; // Shipping
      const customTimeLock = 3600; // 1 hour
      
      const tx = await contracts.factory.connect(seller).createEscrow(
        price,
        contracts.usdc.address,
        itemHash,
        deliveryMethod,
        customTimeLock
      );
      
      const receipt = await tx.wait();
      const event = receipt.events.find(e => e.event === "EscrowCreated");
      
      expect(event).to.not.be.undefined;
      expect(event.args.seller).to.equal(seller.address);
      expect(event.args.price).to.equal(price);
    });
  });

  describe("Module Updates", function () {
    it("Should update module addresses", async function () {
      const { owner, contracts } = await loadFixture(deployFixture);
      
      const newKYCModule = ethers.Wallet.createRandom().address;
      
      await expect(
        contracts.factory.connect(owner).updateModule("KYC", newKYCModule)
      ).to.emit(contracts.factory, "ModuleUpdated")
        .withArgs("KYC", newKYCModule);
      
      const modules = await contracts.factory.getModules();
      expect(modules._kyc).to.equal(newKYCModule);
    });

    it("Should revert on invalid module name", async function () {
      const { owner, contracts } = await loadFixture(deployFixture);
      
      await expect(
        contracts.factory.connect(owner).updateModule(
          "InvalidModule",
          ethers.Wallet.createRandom().address
        )
      ).to.be.revertedWithCustomError(contracts.factory, "InvalidModule");
    });

    it("Should revert on zero address", async function () {
      const { owner, contracts } = await loadFixture(deployFixture);
      
      await expect(
        contracts.factory.connect(owner).updateModule(
          "KYC",
          ethers.constants.AddressZero
        )
      ).to.be.revertedWithCustomError(contracts.factory, "InvalidModule");
    });
  });
});
```

#### 11.4.3 Integration Test Example

```javascript
// test/integration/FullFlow.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployFixture } = require("../helpers/fixtures");

describe("Full Escrow Flow Integration", function () {
  describe("Happy Path", function () {
    it("Should complete full escrow flow", async function () {
      const { seller, buyer, contracts } = await loadFixture(deployFixture);
      
      // 1. Mint tokens for buyer
      const amount = ethers.utils.parseUnits("100", 6);
      await contracts.usdc.mint(buyer.address, amount);
      
      // 2. Seller creates escrow
      const price = ethers.utils.parseUnits("100", 6);
      const itemHash = ethers.utils.id("test-item");
      
      await contracts.factory.connect(seller).createEscrow(
        price,
        contracts.usdc.address,
        itemHash,
        0, // InPerson
        0  // Default time-lock
      );
      
      const escrows = await contracts.factory.getSellerEscrows(seller.address);
      const escrowAddress = escrows[0];
      
      // 3. Add mock KYC verification
      const providerAddress = ethers.Wallet.createRandom().address;
      await contracts.kycModule.addProvider(providerAddress, "TestProvider", 100);
      await contracts.kycModule.grantRole(
        await contracts.kycModule.PROVIDER_ROLE(),
        providerAddress
      );
      
      const kycSigner = await ethers.getImpersonatedSigner(providerAddress);
      await buyer.sendTransaction({ to: providerAddress, value: ethers.utils.parseEther("1") });
      await contracts.kycModule.connect(kycSigner).updateVerification(buyer.address, 80);
      
      // 4. Buyer funds escrow
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
      await contracts.usdc.connect(buyer).approve(escrowAddress, price);
      
      await escrow.connect(buyer).fundEscrow("emergency123");
      
      expect(await escrow.state()).to.equal(1); // Funded
      
      // 5. Seller confirms delivery
      await escrow.connect(seller).confirmDelivery();
      
      expect(await escrow.state()).to.equal(2); // Locked
      
      // 6. Wait for time-lock
      const releaseTime = await escrow.releaseTime();
      await time.increaseTo(releaseTime);
      
      // 7. Release funds
      const sellerBalanceBefore = await contracts.usdc.balanceOf(seller.address);
      await escrow.releaseFunds();
      const sellerBalanceAfter = await contracts.usdc.balanceOf(seller.address);
      
      expect(await escrow.state()).to.equal(3); // Released
      
      // Check seller received funds minus fee
      const fee = price.mul(250).div(10000); // 2.5%
      const expectedAmount = price.sub(fee);
      expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.equal(expectedAmount);
    });
  });

  describe("Dispute Flow", function () {
    it("Should handle dispute resolution", async function () {
      const { seller, buyer, arbitrator, contracts } = await loadFixture(deployFixture);
      
      // Setup and fund escrow
      const price = ethers.utils.parseUnits("100", 6);
      await contracts.usdc.mint(buyer.address, price);
      
      await contracts.factory.connect(seller).createEscrow(
        price,
        contracts.usdc.address,
        ethers.utils.id("dispute-item"),
        0,
        0
      );
      
      const escrows = await contracts.factory.getSellerEscrows(seller.address);
      const escrowAddress = escrows[0];
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
      
      // Mock KYC
      const providerAddress = ethers.Wallet.createRandom().address;
      await contracts.kycModule.addProvider(providerAddress, "TestProvider", 100);
      await contracts.kycModule.grantRole(
        await contracts.kycModule.PROVIDER_ROLE(),
        providerAddress
      );
      const kycSigner = await ethers.getImpersonatedSigner(providerAddress);
      await buyer.sendTransaction({ to: providerAddress, value: ethers.utils.parseEther("1") });
      await contracts.kycModule.connect(kycSigner).updateVerification(buyer.address, 80);
      
      // Fund escrow
      await contracts.usdc.connect(buyer).approve(escrowAddress, price);
      await escrow.connect(buyer).fundEscrow("emergency123");
      
      // Raise dispute
      await escrow.connect(buyer).raiseDispute("Item not as described");
      
      expect(await escrow.state()).to.equal(5); // Disputed
      
      // Arbitrator resolves in favor of buyer
      const disputeId = 1; // First dispute
      await contracts.disputeResolver.connect(arbitrator).arbitratorResolve(
        disputeId,
        buyer.address,
        "Evidence shows item not as described"
      );
      
      // Check buyer received refund
      expect(await contracts.usdc.balanceOf(buyer.address)).to.equal(price);
      expect(await escrow.state()).to.equal(4); // Refunded
    });
  });

  describe("Emergency Flow", function () {
    it("Should handle emergency activation", async function () {
      const { seller, buyer, contracts } = await loadFixture(deployFixture);
      
      // Setup and fund escrow
      const price = ethers.utils.parseEther("1");
      
      await contracts.factory.connect(seller).createEscrow(
        price,
        ethers.constants.AddressZero, // ETH
        ethers.utils.id("emergency-item"),
        0,
        0
      );
      
      const escrows = await contracts.factory.getSellerEscrows(seller.address);
      const escrowAddress = escrows[0];
      const escrow = await ethers.getContractAt("EscrowImplementation", escrowAddress);
      
      // Mock KYC
      const providerAddress = ethers.Wallet.createRandom().address;
      await contracts.kycModule.addProvider(providerAddress, "TestProvider", 100);
      await contracts.kycModule.grantRole(
        await contracts.kycModule.PROVIDER_ROLE(),
        providerAddress
      );
      const kycSigner = await ethers.getImpersonatedSigner(providerAddress);
      await buyer.sendTransaction({ to: providerAddress, value: ethers.utils.parseEther("1") });
      await contracts.kycModule.connect(kycSigner).updateVerification(buyer.address, 80);
      
      // Fund escrow
      await escrow.connect(buyer).fundEscrow("emergency123", { value: price });
      
      // Confirm delivery
      await escrow.connect(seller).confirmDelivery();
      
      // Activate emergency
      const releaseTimeBefore = await escrow.releaseTime();
      await escrow.connect(buyer).activateEmergency("emergency123");
      const releaseTimeAfter = await escrow.releaseTime();
      
      expect(await escrow.state()).to.equal(6); // Emergency
      expect(releaseTimeAfter).to.be.gt(releaseTimeBefore);
      
      // Wait for extended time-lock
      await time.increaseTo(releaseTimeAfter);
      
      // Funds can still be released after emergency
      await escrow.releaseFunds();
      expect(await escrow.state()).to.equal(3); // Released
    });
  });
});
```

### 11.5 Hardhat Tasks

#### 11.5.1 Account Management Task

```javascript
// tasks/accounts.js
const { task } = require("hardhat/config");

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    const balance = await account.getBalance();
    console.log(`${account.address}: ${hre.ethers.utils.formatEther(balance)} ETH`);
  }
});

task("fund", "Fund an account with ETH")
  .addParam("address", "The address to fund")
  .addParam("amount", "Amount in ETH")
  .setAction(async (taskArgs, hre) => {
    const [funder] = await hre.ethers.getSigners();
    const tx = await funder.sendTransaction({
      to: taskArgs.address,
      value: hre.ethers.utils.parseEther(taskArgs.amount)
    });
    await tx.wait();
    console.log(`Funded ${taskArgs.address} with ${taskArgs.amount} ETH`);
  });
```

#### 11.5.2 Contract Verification Task

```javascript
// tasks/verify.js
const { task } = require("hardhat/config");
const { getAddress } = require("../scripts/utils/addresses");

task("verify-all", "Verify all deployed contracts", async (taskArgs, hre) => {
  const network = hre.network.name;
  console.log(`Verifying contracts on ${network}...`);

  // Get addresses
  const addresses = {
    KYCModule: await getAddress(network, "KYCModule"),
    ReputationOracle: await getAddress(network, "ReputationOracle"),
    TimeLockModule: await getAddress(network, "TimeLockModule"),
    DisputeResolver: await getAddress(network, "DisputeResolver"),
    EmergencyModule: await getAddress(network, "EmergencyModule"),
    EscrowImplementation: await getAddress(network, "EscrowImplementation"),
    EscrowFactory: await getAddress(network, "EscrowFactory")
  };

  // Verify each contract
  for (const [name, address] of Object.entries(addresses)) {
    if (!address) {
      console.log(`${name} not deployed on ${network}`);
      continue;
    }

    console.log(`\nVerifying ${name} at ${address}...`);
    
    try {
      await hre.run("verify:verify", {
        address: address,
        constructorArguments: getConstructorArgs(name, addresses)
      });
      console.log(`${name} verified successfully`);
    } catch (error) {
      console.error(`Failed to verify ${name}:`, error.message);
    }
  }
});

function getConstructorArgs(contractName, addresses) {
  switch (contractName) {
    case "TimeLockModule":
      return [addresses.ReputationOracle, addresses.KYCModule];
    case "EscrowFactory":
      return [addresses.EscrowImplementation];
    default:
      return [];
  }
}
```

#### 11.5.3 Interaction Task

```javascript
// tasks/interact.js
const { task } = require("hardhat/config");
const { getAddress } = require("../scripts/utils/addresses");

task("create-escrow", "Create a new escrow")
  .addParam("price", "Price in tokens")
  .addParam("token", "Token address (or 'ETH')")
  .addParam("item", "Item description")
  .setAction(async (taskArgs, hre) => {
    const [seller] = await hre.ethers.getSigners();
    const network = hre.network.name;
    
    const factoryAddress = await getAddress(network, "EscrowFactory");
    const factory = await hre.ethers.getContractAt("EscrowFactory", factoryAddress);
    
    const price = hre.ethers.utils.parseUnits(taskArgs.price, 
      taskArgs.token === "ETH" ? 18 : 6);
    const tokenAddress = taskArgs.token === "ETH" ? 
      hre.ethers.constants.AddressZero : taskArgs.token;
    const itemHash = hre.ethers.utils.id(taskArgs.item);
    
    console.log("Creating escrow...");
    const tx = await factory.createEscrow(
      price,
      tokenAddress,
      itemHash,
      0, // InPerson
      0  // Default time-lock
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === "EscrowCreated");
    
    console.log(`Escrow created at: ${event.args.escrow}`);
    console.log(`Transaction hash: ${tx.hash}`);
  });

task("list-escrows", "List all escrows for a seller")
  .addParam("seller", "Seller address")
  .setAction(async (taskArgs, hre) => {
    const network = hre.network.name;
    const factoryAddress = await getAddress(network, "EscrowFactory");
    const factory = await hre.ethers.getContractAt("EscrowFactory", factoryAddress);
    
    const escrows = await factory.getSellerEscrows(taskArgs.seller);
    
    console.log(`\nEscrows for ${taskArgs.seller}:`);
    for (let i = 0; i < escrows.length; i++) {
      console.log(`${i + 1}. ${escrows[i]}`);
      
      // Get escrow details
      const escrow = await hre.ethers.getContractAt(
        "EscrowImplementation", 
        escrows[i]
      );
      const details = await escrow.getEscrowDetails();
      
      console.log(`   Price: ${hre.ethers.utils.formatUnits(details._price, 6)}`);
      console.log(`   State: ${details._state}`);
      console.log(`   Release Time: ${new Date(details._releaseTime * 1000)}`);
    }
  });
```

### 11.6 Package.json Scripts

```json
{
  "name": "hackers-market-contracts",
  "version": "1.0.0",
  "description": "Smart contracts for Hackers.Market anti-coercion P2P escrow protocol",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "test:unit": "hardhat test test/unit/**/*.test.js",
    "test:integration": "hardhat test test/integration/**/*.test.js",
    "test:coverage": "hardhat coverage",
    "deploy:localhost": "hardhat run scripts/deploy/01-deploy-modules.js --network localhost && hardhat run scripts/deploy/02-deploy-factory.js --network localhost",
    "deploy:mumbai": "hardhat run scripts/deploy/01-deploy-modules.js --network polygonMumbai && hardhat run scripts/deploy/02-deploy-factory.js --network polygonMumbai",
    "deploy:polygon": "hardhat run scripts/deploy/01-deploy-modules.js --network polygon && hardhat run scripts/deploy/02-deploy-factory.js --network polygon",
    "verify:mumbai": "hardhat verify-all --network polygonMumbai",
    "verify:polygon": "hardhat verify-all --network polygon",
    "size": "hardhat size-contracts",
    "gas": "REPORT_GAS=true hardhat test",
    "node": "hardhat node",
    "accounts": "hardhat accounts",
    "clean": "hardhat clean",
    "flatten": "hardhat flatten",
    "format": "prettier --write 'contracts/**/*.sol' 'test/**/*.js' 'scripts/**/*.js'",
    "lint": "solhint 'contracts/**/*.sol'",
    "slither": "slither .",
    "mythril": "mythril analyze contracts/**/*.sol"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^3.0.0",
    "@nomiclabs/hardhat-etherscan": "^3.1.7",
    "@openzeppelin/contracts": "^4.9.3",
    "@openzeppelin/contracts-upgradeable": "^4.9.3",
    "@openzeppelin/hardhat-upgrades": "^2.0.0",
    "@layerzerolabs/solidity-examples": "^1.0.0",
    "chai": "^4.3.7",
    "dotenv": "^16.3.1",
    "ethers": "^5.7.2",
    "hardhat": "^2.17.0",
    "hardhat-contract-sizer": "^2.10.0",
    "hardhat-gas-reporter": "^1.0.9",
    "prettier": "^3.0.0",
    "prettier-plugin-solidity": "^1.1.3",
    "solhint": "^3.6.0",
    "solidity-coverage": "^0.8.4"
  }
}