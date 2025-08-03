// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDisputeResolver
 * @dev Interface for dispute resolution system
 */
interface IDisputeResolver {
    // === Enums ===
    
    enum DisputeStatus {
        Filed,
        UnderReview,
        AutoResolved,
        Resolved,
        Escalated,
        Dismissed
    }

    enum DisputeOutcome {
        Pending,
        BuyerFavored,
        SellerFavored,
        Partial,
        Cancelled
    }

    // === Structs ===
    
    struct DisputeCase {
        address escrow;
        address disputant;
        string reason;
        uint256 filedAt;
        uint256 amount;
        uint256 stake;
        DisputeStatus status;
        address assignedArbitrator;
        uint256 resolvedAt;
        string resolution;
        DisputeOutcome outcome;
    }

    // === Functions ===
    
    /**
     * @dev File a new dispute
     * @param escrow The escrow contract address
     * @param reason Reason for the dispute
     * @return disputeId Unique identifier for the dispute
     */
    function fileDispute(
        address escrow,
        string calldata reason
    ) external payable returns (bytes32 disputeId);
    
    /**
     * @dev Resolve a dispute
     * @param disputeId The dispute identifier
     * @param outcome The resolution outcome
     * @param resolution Description of the resolution
     */
    function resolveDispute(
        bytes32 disputeId,
        DisputeOutcome outcome,
        string calldata resolution
    ) external;
    
    /**
     * @dev Get dispute information
     * @param disputeId The dispute identifier
     * @return The dispute case details
     */
    function getDispute(bytes32 disputeId) external view returns (DisputeCase memory);
    
    /**
     * @dev Check if dispute exists and is active
     * @param disputeId The dispute identifier
     * @return Whether the dispute is active
     */
    function isActiveDispute(bytes32 disputeId) external view returns (bool);
}