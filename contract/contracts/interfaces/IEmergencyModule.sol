// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEmergencyModule
 * @dev Interface for the HCKM emergency intervention module (panic button functionality)
 */
interface IEmergencyModule {
    /**
     * @dev Emergency activation record
     */
    struct EmergencyRecord {
        address escrow;           // Escrow contract address
        address activator;        // Who activated emergency
        uint256 activatedAt;      // Activation timestamp
        bytes32 codeHash;         // Hash of panic code used
        string reason;            // Optional reason/description
        bool isActive;            // Current status
        uint256 resolvedAt;       // Resolution timestamp (if resolved)
    }

    /**
     * @dev Emergency response configuration
     */
    struct EmergencyConfig {
        uint256 responseTime;     // Time for security team to respond
        uint256 cooldownPeriod;   // Cooldown between activations
        uint256 maxActivations;   // Max activations per user per period
        bool autoLockEnabled;     // Auto-lock escrow on activation
        uint256 lockExtension;    // Extension duration for emergency
    }

    /**
     * @dev Security contact information
     */
    struct SecurityContact {
        address contactAddress;   // Security team address
        bool isActive;           // Active status
        uint256 responseCount;    // Number of responses handled
        uint256 addedAt;         // When contact was added
    }

    /**
     * @dev Events
     */
    event EmergencyActivated(
        address indexed escrow,
        address indexed activator,
        bytes32 codeHash,
        uint256 timestamp
    );
    
    event EmergencyResolved(
        address indexed escrow,
        address indexed resolver,
        uint256 timestamp
    );
    
    event SecurityContactAdded(
        address indexed contact,
        uint256 timestamp
    );
    
    event SecurityContactRemoved(
        address indexed contact,
        uint256 timestamp
    );
    
    event EmergencyConfigUpdated(
        uint256 responseTime,
        uint256 cooldownPeriod,
        uint256 lockExtension
    );

    event AlertSent(
        address indexed escrow,
        address indexed recipient,
        uint256 timestamp
    );

    /**
     * @dev Errors
     */
    error InvalidEmergencyCode();
    error EmergencyAlreadyActive();
    error EmergencyNotActive();
    error CooldownPeriodActive();
    error MaxActivationsReached();
    error UnauthorizedResolver();
    error InvalidConfiguration();
    error NoSecurityContacts();

    /**
     * @dev Activate emergency for an escrow
     * @param escrow Escrow contract address
     * @param codeHash Hash of the panic code
     * @param reason Optional reason for activation
     * @return success True if activation successful
     */
    function activateEmergency(
        address escrow,
        bytes32 codeHash,
        string calldata reason
    ) external returns (bool success);

    /**
     * @dev Verify a panic code
     * @param code Panic code to verify
     * @param expectedHash Expected hash of the code
     * @return valid True if code matches hash
     */
    function verifyPanicCode(
        string calldata code,
        bytes32 expectedHash
    ) external pure returns (bool valid);

    /**
     * @dev Resolve an emergency situation
     * @param escrow Escrow contract address
     * @param resolution Resolution description
     */
    function resolveEmergency(
        address escrow,
        string calldata resolution
    ) external;

    /**
     * @dev Check if emergency is active for an escrow
     * @param escrow Escrow contract address
     * @return active True if emergency is active
     */
    function isEmergencyActive(address escrow) 
        external 
        view 
        returns (bool active);

    /**
     * @dev Get emergency record for an escrow
     * @param escrow Escrow contract address
     * @return record Emergency record
     */
    function getEmergencyRecord(address escrow) 
        external 
        view 
        returns (EmergencyRecord memory record);

    /**
     * @dev Get user's activation count in current period
     * @param user User address
     * @return count Number of activations
     */
    function getUserActivationCount(address user) 
        external 
        view 
        returns (uint256 count);

    /**
     * @dev Get current configuration
     * @return config Emergency configuration
     */
    function getConfig() 
        external 
        view 
        returns (EmergencyConfig memory config);

    /**
     * @dev Update emergency configuration (admin only)
     * @param config New configuration
     */
    function updateConfig(EmergencyConfig calldata config) external;

    /**
     * @dev Add security contact (admin only)
     * @param contact Security contact address
     */
    function addSecurityContact(address contact) external;

    /**
     * @dev Remove security contact (admin only)
     * @param contact Security contact address
     */
    function removeSecurityContact(address contact) external;

    /**
     * @dev Get all active security contacts
     * @return contacts Array of security contact addresses
     */
    function getSecurityContacts() 
        external 
        view 
        returns (address[] memory contacts);

    /**
     * @dev Send alert to security contacts
     * @param escrow Escrow contract address
     * @param message Alert message
     */
    function sendSecurityAlert(
        address escrow,
        string calldata message
    ) external;

    /**
     * @dev Calculate lock extension for emergency
     * @param escrow Escrow contract address
     * @return extension Lock extension duration in seconds
     */
    function calculateLockExtension(address escrow) 
        external 
        view 
        returns (uint256 extension);
}