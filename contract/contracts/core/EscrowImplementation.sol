// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IEscrow.sol";
import "../interfaces/IEscrowFactory.sol";

/**
 * @title EscrowImplementation
 * @dev HCKM (Hackers.Market) implementation contract for individual anti-coercion escrows
 * @dev Each escrow instance is a minimal proxy pointing to this implementation
 * @dev Implements time-lock mechanisms and emergency intervention for physical safety
 */
contract EscrowImplementation is 
    Initializable,
    ReentrancyGuardUpgradeable,
    IEscrow 
{
    // === State Variables ===
    
    /// @dev Factory contract that deployed this escrow
    address private _factory;
    
    /// @dev Seller's address (receives funds after successful trade)
    address private _seller;
    
    /// @dev Buyer's address (funds the escrow)
    address private _buyer;
    
    /// @dev Escrow amount in wei
    uint256 private _amount;
    
    /// @dev Current state of the escrow
    EscrowState private _state;
    
    /// @dev Trade description
    string private _description;
    
    /// @dev Unique trade identifier
    bytes32 private _tradeId;
    
    /// @dev Creation timestamp
    uint256 private _createdAt;
    
    /// @dev Last update timestamp
    uint256 private _updatedAt;
    
    /// @dev Time-lock end timestamp (when funds can be released)
    uint256 private _timeLockEnd;
    
    /// @dev Default time-lock duration (24 hours)
    uint256 private constant DEFAULT_TIMELOCK = 24 hours;
    
    /// @dev Minimum time-lock duration (1 hour)
    uint256 private constant MIN_TIMELOCK = 1 hours;
    
    /// @dev Maximum time-lock duration (7 days)
    uint256 private constant MAX_TIMELOCK = 7 days;
    
    /// @dev Emergency hash for panic button activation
    bytes32 private _emergencyHash;
    
    /// @dev Emergency data if activated
    EmergencyData private _emergencyData;
    
    /// @dev Dispute information if raised
    DisputeInfo private _disputeInfo;
    
    /// @dev Flag for emergency activation
    bool private _emergencyActive;
    
    // === Modifiers ===
    
    /**
     * @dev Only seller can call
     */
    modifier onlySeller() {
        if (msg.sender != _seller) revert Unauthorized();
        _;
    }
    
    /**
     * @dev Only buyer can call
     */
    modifier onlyBuyer() {
        if (msg.sender != _buyer) revert Unauthorized();
        _;
    }
    
    /**
     * @dev Only seller or buyer can call
     */
    modifier onlyParties() {
        if (msg.sender != _seller && msg.sender != _buyer) revert Unauthorized();
        _;
    }
    
    /**
     * @dev Ensure escrow is in specific state
     */
    modifier inState(EscrowState requiredState) {
        if (_state != requiredState) revert InvalidState();
        _;
    }
    
    /**
     * @dev Ensure escrow is not in emergency state
     */
    modifier notInEmergency() {
        if (_emergencyActive) revert EmergencyActive();
        _;
    }
    
    // === Initialization ===
    
    /**
     * @dev Initialize the escrow contract (called by factory)
     * @param seller_ Seller's address
     * @param buyer_ Buyer's address  
     * @param amount_ Escrow amount
     * @param description_ Trade description
     * @param customTimeLock_ Custom time-lock duration (0 = use default)
     * @param tradeId_ Unique trade identifier
     * @param factory_ Factory contract address
     */
    function initialize(
        address seller_,
        address buyer_,
        uint256 amount_,
        string calldata description_,
        uint256 customTimeLock_,
        bytes32 tradeId_,
        address factory_
    ) external override initializer {
        if (seller_ == address(0) || buyer_ == address(0)) revert InvalidBuyer();
        if (seller_ == buyer_) revert InvalidBuyer();
        if (amount_ == 0) revert InvalidAmount();
        if (bytes(description_).length == 0) revert InvalidDescription();
        if (factory_ == address(0)) revert InvalidContract();
        
        __ReentrancyGuard_init();
        
        _seller = seller_;
        _buyer = buyer_;
        _amount = amount_;
        _description = description_;
        _tradeId = tradeId_;
        _factory = factory_;
        _state = EscrowState.Created;
        _createdAt = block.timestamp;
        _updatedAt = block.timestamp;
        
        // Set time-lock duration
        if (customTimeLock_ > 0) {
            if (customTimeLock_ < MIN_TIMELOCK || customTimeLock_ > MAX_TIMELOCK) {
                revert InvalidAmount();
            }
            _timeLockEnd = customTimeLock_;
        } else {
            _timeLockEnd = DEFAULT_TIMELOCK;
        }
    }
    
    // === Core Functions ===
    
    /**
     * @dev Fund the escrow (buyer only)
     * @param emergencyHash Hash of emergency/panic code
     */
    function fundEscrow(bytes32 emergencyHash) 
        external 
        payable 
        override 
        onlyBuyer 
        inState(EscrowState.Created)
        nonReentrant
    {
        if (msg.value != _amount) revert InsufficientAmount();
        if (emergencyHash == bytes32(0)) revert InvalidEmergencyHash();
        
        _emergencyHash = emergencyHash;
        _state = EscrowState.Funded;
        _updatedAt = block.timestamp;
        
        emit EscrowFunded(_buyer, msg.value, emergencyHash);
        emit StateChanged(EscrowState.Created, EscrowState.Funded);
    }
    
    /**
     * @dev Confirm receipt of goods/services (seller only)
     * @dev Starts the time-lock period
     */
    function confirmReceipt() 
        external 
        override 
        onlySeller 
        inState(EscrowState.Funded)
        notInEmergency
    {
        _state = EscrowState.Locked;
        _timeLockEnd = block.timestamp + _timeLockEnd; // Convert duration to timestamp
        _updatedAt = block.timestamp;
        
        emit StateChanged(EscrowState.Funded, EscrowState.Locked);
        emit TimeLockUpdated(_timeLockEnd);
    }
    
    /**
     * @dev Release funds after time-lock expires
     * @dev Can be called by anyone after time-lock
     */
    function releaseFunds() 
        external 
        override 
        inState(EscrowState.Locked)
        notInEmergency
        nonReentrant
    {
        if (block.timestamp < _timeLockEnd) revert TimeLockActive();
        
        _state = EscrowState.Released;
        _updatedAt = block.timestamp;
        
        uint256 releaseAmount = address(this).balance;
        
        emit StateChanged(EscrowState.Locked, EscrowState.Released);
        emit FundsReleased(_seller, releaseAmount);
        
        // Transfer funds to seller
        (bool success, ) = _seller.call{value: releaseAmount}("");
        if (!success) revert TransferFailed();
    }
    
    /**
     * @dev Activate emergency stop with panic code
     * @param panicCode Panic code for verification
     */
    function emergencyStop(string calldata panicCode) 
        external 
        override 
        onlyBuyer
        nonReentrant
    {
        if (_state != EscrowState.Funded && _state != EscrowState.Locked) {
            revert InvalidState();
        }
        
        // Verify panic code
        if (keccak256(abi.encodePacked(panicCode)) != _emergencyHash) {
            revert InvalidPanicCode();
        }
        
        _emergencyActive = true;
        _state = EscrowState.Emergency;
        _updatedAt = block.timestamp;
        
        // Extend time-lock by 48 hours for investigation
        uint256 extension = 48 hours;
        if (_state == EscrowState.Locked) {
            _timeLockEnd += extension;
        } else {
            _timeLockEnd = block.timestamp + extension;
        }
        
        _emergencyData = EmergencyData({
            activator: msg.sender,
            activatedAt: block.timestamp,
            lockExtension: extension,
            panicCodeHash: _emergencyHash
        });
        
        emit EmergencyActivated(msg.sender, extension);
        emit StateChanged(_state, EscrowState.Emergency);
        emit TimeLockUpdated(_timeLockEnd);
    }
    
    /**
     * @dev Raise a dispute
     * @param reason Reason for the dispute
     */
    function raiseDispute(string calldata reason) 
        external 
        override 
        onlyParties
        nonReentrant
    {
        if (_state != EscrowState.Funded && _state != EscrowState.Locked) {
            revert InvalidState();
        }
        if (_disputeInfo.raisedAt > 0) revert DisputeActive();
        
        _state = EscrowState.Disputed;
        _updatedAt = block.timestamp;
        
        // Extend time-lock for dispute resolution
        if (_state == EscrowState.Locked) {
            _timeLockEnd += 72 hours;
        } else {
            _timeLockEnd = block.timestamp + 72 hours;
        }
        
        _disputeInfo = DisputeInfo({
            disputant: msg.sender,
            reason: reason,
            raisedAt: block.timestamp,
            resolved: false,
            resolver: address(0),
            resolvedAt: 0
        });
        
        emit DisputeRaised(msg.sender, reason);
        emit StateChanged(_state, EscrowState.Disputed);
        emit TimeLockUpdated(_timeLockEnd);
    }
    
    /**
     * @dev Cancel escrow (only in Created state)
     * @dev Can be called by seller or buyer
     */
    function cancelEscrow() 
        external 
        override 
        onlyParties
        inState(EscrowState.Created)
    {
        _state = EscrowState.Cancelled;
        _updatedAt = block.timestamp;
        
        emit StateChanged(EscrowState.Created, EscrowState.Cancelled);
    }
    
    // === View Functions ===
    
    /**
     * @dev Get current escrow state
     */
    function getState() external view override returns (EscrowState) {
        return _state;
    }
    
    /**
     * @dev Get remaining time-lock duration
     */
    function getTimeLockRemaining() external view override returns (uint256) {
        if (_state != EscrowState.Locked && _state != EscrowState.Emergency && _state != EscrowState.Disputed) {
            return 0;
        }
        
        if (block.timestamp >= _timeLockEnd) {
            return 0;
        }
        
        return _timeLockEnd - block.timestamp;
    }
    
    /**
     * @dev Get complete escrow information
     */
    function getEscrowInfo() external view override returns (EscrowInfo memory) {
        return EscrowInfo({
            seller: _seller,
            buyer: _buyer,
            amount: _amount,
            state: _state,
            timeLockEnd: _timeLockEnd,
            description: _description,
            tradeId: _tradeId,
            emergencyActive: _emergencyActive,
            createdAt: _createdAt,
            updatedAt: _updatedAt
        });
    }
    
    /**
     * @dev Get dispute information
     */
    function getDisputeInfo() external view override returns (DisputeInfo memory) {
        return _disputeInfo;
    }
    
    /**
     * @dev Get emergency data
     */
    function getEmergencyData() external view override returns (EmergencyData memory) {
        return _emergencyData;
    }
    
    /**
     * @dev Check if time-lock has expired
     */
    function isTimeLockExpired() external view override returns (bool) {
        if (_state != EscrowState.Locked) {
            return false;
        }
        return block.timestamp >= _timeLockEnd;
    }
    
    /**
     * @dev Verify emergency hash
     */
    function verifyEmergencyHash(string calldata panicCode) external view override returns (bool) {
        return keccak256(abi.encodePacked(panicCode)) == _emergencyHash;
    }
    
    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Get seller address
     */
    function getSeller() external view returns (address) {
        return _seller;
    }
    
    /**
     * @dev Get buyer address
     */
    function getBuyer() external view returns (address) {
        return _buyer;
    }
    
    /**
     * @dev Get escrow amount
     */
    function getAmount() external view returns (uint256) {
        return _amount;
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}