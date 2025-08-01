// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEscrowStructs
 * @dev Common data structures and enums for the HCKM (Hackers.Market) anti-coercion escrow system
 */
interface IEscrowStructs {
    /**
     * @dev Enum representing the current state of an escrow
     */
    enum EscrowState {
        Created,    // Escrow created but not funded
        Funded,     // Buyer has funded the escrow
        Locked,     // Time-lock period active
        Released,   // Funds released to seller
        Disputed,   // Dispute raised, awaiting resolution  
        Emergency,  // Emergency stop activated
        Cancelled   // Escrow cancelled, funds returned
    }

    /**
     * @dev Parameters for creating a new escrow
     */
    struct CreateEscrowParams {
        address buyer;           // Buyer's address
        uint256 amount;          // Escrow amount in wei
        string description;      // Trade description
        uint256 customTimeLock;  // Custom time-lock override (0 = use default)
        bytes32 tradeId;        // Unique trade identifier
    }

    /**
     * @dev Complete information about an escrow
     */
    struct EscrowInfo {
        address seller;          // Seller's address
        address buyer;           // Buyer's address
        uint256 amount;          // Escrow amount
        EscrowState state;       // Current state
        uint256 timeLockEnd;     // Time-lock expiration timestamp
        string description;      // Trade description
        bytes32 tradeId;        // Trade identifier
        bool emergencyActive;    // Emergency stop status
        uint256 createdAt;      // Creation timestamp
        uint256 updatedAt;      // Last update timestamp
    }

    /**
     * @dev Dispute information
     */
    struct DisputeInfo {
        address disputant;       // Who raised the dispute
        string reason;          // Dispute reason
        uint256 raisedAt;       // When dispute was raised
        bool resolved;          // Resolution status
        address resolver;       // Who resolved the dispute
        uint256 resolvedAt;     // When dispute was resolved
    }

    /**
     * @dev Emergency activation data
     */
    struct EmergencyData {
        address activator;       // Who activated emergency
        uint256 activatedAt;     // When emergency was activated
        uint256 lockExtension;   // Additional lock time in seconds
        bytes32 panicCodeHash;   // Hash of panic code
    }
}