// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IEscrowStructs.sol";

/**
 * @title IEscrow
 * @dev Interface for HCKM (Hackers.Market) individual anti-coercion escrow contracts
 */
interface IEscrow is IEscrowStructs {
    /**
     * @dev Events
     */
    event EscrowFunded(address indexed buyer, uint256 amount, bytes32 emergencyHash);
    event FundsReleased(address indexed recipient, uint256 amount);
    event StateChanged(EscrowState oldState, EscrowState newState);
    event TimeLockUpdated(uint256 newLockTime);
    event EmergencyActivated(address indexed activator, uint256 lockExtension);
    event DisputeRaised(address indexed disputant, string reason);
    event DisputeResolved(address indexed resolver, bool sellerWins);

    /**
     * @dev Errors
     */
    error InvalidState();
    error Unauthorized();
    error InsufficientAmount();
    error TimeLockActive();
    error EmergencyActive();
    error DisputeActive();
    error InvalidEmergencyHash();
    error InvalidPanicCode();
    error EscrowExpired();
    error InvalidBuyer();
    error InvalidAmount();
    error InvalidDescription();
    error InvalidContract();
    error TransferFailed();

    /**
     * @dev Initialize the escrow contract (called by factory)
     * @param seller_ Seller's address
     * @param buyer_ Buyer's address  
     * @param amount_ Escrow amount
     * @param description_ Trade description
     * @param customTimeLock_ Custom time-lock duration
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
    ) external;

    /**
     * @dev Fund the escrow (buyer only)
     * @param emergencyHash Hash of emergency/panic code
     */
    function fundEscrow(bytes32 emergencyHash) external payable;

    /**
     * @dev Confirm receipt of goods/services (seller only)
     */
    function confirmReceipt() external;

    /**
     * @dev Release funds after time-lock expires
     */
    function releaseFunds() external;

    /**
     * @dev Activate emergency stop with panic code
     * @param panicCode Panic code for verification
     */
    function emergencyStop(string calldata panicCode) external;

    /**
     * @dev Raise a dispute
     * @param reason Reason for the dispute
     */
    function raiseDispute(string calldata reason) external;

    /**
     * @dev Cancel escrow (only in Created state)
     */
    function cancelEscrow() external;

    /**
     * @dev Get current escrow state
     * @return state Current state
     */
    function getState() external view returns (EscrowState state);

    /**
     * @dev Get remaining time-lock duration
     * @return remaining Seconds remaining in time-lock
     */
    function getTimeLockRemaining() external view returns (uint256 remaining);

    /**
     * @dev Get complete escrow information
     * @return info Complete escrow data
     */
    function getEscrowInfo() external view returns (EscrowInfo memory info);

    /**
     * @dev Get dispute information
     * @return dispute Dispute data
     */
    function getDisputeInfo() external view returns (DisputeInfo memory dispute);

    /**
     * @dev Get emergency data
     * @return emergency Emergency activation data
     */
    function getEmergencyData() external view returns (EmergencyData memory emergency);

    /**
     * @dev Check if time-lock has expired
     * @return expired True if time-lock has expired
     */
    function isTimeLockExpired() external view returns (bool expired);

    /**
     * @dev Verify emergency hash
     * @param panicCode Panic code to verify
     * @return valid True if panic code is valid
     */
    function verifyEmergencyHash(string calldata panicCode) external view returns (bool valid);
}