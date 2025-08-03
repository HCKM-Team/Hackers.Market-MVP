// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../interfaces/IEmergencyModule.sol";
import "../interfaces/IEscrow.sol";
import "../interfaces/IEscrowStructs.sol";

/**
 * @title EmergencyModule
 * @dev HCKM emergency intervention module for panic button functionality
 * @dev Handles emergency activations, security alerts, and response coordination
 */
contract EmergencyModule is 
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IEmergencyModule 
{
    /// @dev Emergency configuration
    EmergencyConfig private _config;

    /// @dev Mapping from escrow to emergency record
    mapping(address => EmergencyRecord) private _emergencyRecords;

    /// @dev Mapping from user to activation timestamps
    mapping(address => uint256[]) private _userActivations;

    /// @dev Array of security contact addresses
    address[] private _securityContacts;

    /// @dev Mapping to check if address is a security contact
    mapping(address => bool) private _isSecurityContact;

    /// @dev Mapping of security contact details
    mapping(address => SecurityContact) private _contactDetails;

    /// @dev Authorized callers (factory and escrow contracts)
    mapping(address => bool) private _authorizedCallers;

    /// @dev Cooldown tracking per user
    mapping(address => uint256) private _lastActivation;

    /// @dev Factory address for escrow validation
    address private _factory;

    /// @dev Storage gap for future upgrades
    uint256[41] private __gap;

    /**
     * @dev Modifier to check authorized callers
     */
    modifier onlyAuthorized() {
        require(
            _authorizedCallers[msg.sender] || msg.sender == owner() || _isValidEscrow(msg.sender),
            "Unauthorized"
        );
        _;
    }

    /**
     * @dev Modifier to check security contacts
     */
    modifier onlySecurityContact() {
        require(
            _isSecurityContact[msg.sender] || msg.sender == owner(),
            "Not security contact"
        );
        _;
    }

    /**
     * @dev Initialize the module
     * @param owner_ Owner address
     */
    function initialize(address owner_) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        // Set default configuration
        _config = EmergencyConfig({
            responseTime: 30 minutes,      // 30 minutes for security response
            cooldownPeriod: 1 hours,        // 1 hour cooldown between activations
            maxActivations: 3,              // Max 3 activations per day
            autoLockEnabled: true,          // Auto-lock escrow on emergency
            lockExtension: 48 hours         // 48 hours extension
        });
    }

    /**
     * @dev Set factory address for escrow validation
     * @param factory_ Factory contract address
     */
    function setFactory(address factory_) external onlyOwner {
        require(factory_ != address(0), "Invalid factory address");
        _factory = factory_;
    }

    /**
     * @dev Activate emergency for an escrow
     * @param escrow Escrow contract address
     * @param activator Address of the user who activated the emergency
     * @param codeHash Hash of the panic code
     * @param reason Optional reason for activation
     * @return success True if activation successful
     */
    function activateEmergency(
        address escrow,
        address activator,
        bytes32 codeHash,
        string calldata reason
    ) 
        external 
        override 
        onlyAuthorized
        nonReentrant
        returns (bool success) 
    {
        // Check if emergency already active
        if (_emergencyRecords[escrow].isActive) {
            revert EmergencyAlreadyActive();
        }

        // Check cooldown period (only if user has activated before)
        if (_lastActivation[activator] != 0 && 
            block.timestamp < _lastActivation[activator] + _config.cooldownPeriod) {
            revert CooldownPeriodActive();
        }

        // Check activation limit
        uint256 recentCount = _getRecentActivationCount(activator);
        if (recentCount >= _config.maxActivations) {
            revert MaxActivationsReached();
        }

        // Create emergency record
        _emergencyRecords[escrow] = EmergencyRecord({
            escrow: escrow,
            activator: activator,
            activatedAt: block.timestamp,
            codeHash: codeHash,
            reason: reason,
            isActive: true,
            resolvedAt: 0
        });

        // Track activation
        _userActivations[activator].push(block.timestamp);
        _lastActivation[activator] = block.timestamp;

        // Emit events
        emit EmergencyActivated(escrow, activator, codeHash, block.timestamp);

        // Send alerts to security contacts
        _notifySecurityContacts(escrow, reason);

        return true;
    }

    /**
     * @dev Verify a panic code
     * @param code Panic code to verify
     * @param expectedHash Expected hash of the code
     * @return valid True if code matches hash
     */
    function verifyPanicCode(
        string calldata code,
        bytes32 expectedHash
    ) 
        external 
        pure 
        override 
        returns (bool) 
    {
        return keccak256(abi.encodePacked(code)) == expectedHash;
    }

    /**
     * @dev Resolve an emergency situation
     * @param escrow Escrow contract address
     * @param resolution Resolution description
     */
    function resolveEmergency(
        address escrow,
        string calldata resolution
    ) 
        external 
        override 
        onlySecurityContact
        nonReentrant
    {
        EmergencyRecord storage record = _emergencyRecords[escrow];
        
        if (!record.isActive) {
            revert EmergencyNotActive();
        }

        // Update record
        record.isActive = false;
        record.resolvedAt = block.timestamp;

        // Update security contact stats
        if (_isSecurityContact[msg.sender]) {
            _contactDetails[msg.sender].responseCount++;
        }

        emit EmergencyResolved(escrow, msg.sender, block.timestamp);
    }

    /**
     * @dev Check if emergency is active for an escrow
     * @param escrow Escrow contract address
     * @return active True if emergency is active
     */
    function isEmergencyActive(address escrow) 
        external 
        view 
        override 
        returns (bool) 
    {
        return _emergencyRecords[escrow].isActive;
    }

    /**
     * @dev Get emergency record for an escrow
     * @param escrow Escrow contract address
     * @return record Emergency record
     */
    function getEmergencyRecord(address escrow) 
        external 
        view 
        override 
        returns (EmergencyRecord memory) 
    {
        return _emergencyRecords[escrow];
    }

    /**
     * @dev Get user's activation count in current period
     * @param user User address
     * @return count Number of activations
     */
    function getUserActivationCount(address user) 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _getRecentActivationCount(user);
    }

    /**
     * @dev Get current configuration
     * @return config Emergency configuration
     */
    function getConfig() 
        external 
        view 
        override 
        returns (EmergencyConfig memory) 
    {
        return _config;
    }

    /**
     * @dev Update emergency configuration (admin only)
     * @param config New configuration
     */
    function updateConfig(EmergencyConfig calldata config) 
        external 
        override 
        onlyOwner 
    {
        // Validate configuration
        if (config.responseTime == 0 || 
            config.cooldownPeriod == 0 || 
            config.maxActivations == 0 ||
            config.lockExtension == 0) {
            revert InvalidConfiguration();
        }

        _config = config;

        emit EmergencyConfigUpdated(
            config.responseTime,
            config.cooldownPeriod,
            config.lockExtension
        );
    }

    /**
     * @dev Add security contact (admin only)
     * @param contact Security contact address
     */
    function addSecurityContact(address contact) 
        external 
        override 
        onlyOwner 
    {
        if (contact == address(0)) {
            revert InvalidConfiguration();
        }

        if (!_isSecurityContact[contact]) {
            _securityContacts.push(contact);
            _isSecurityContact[contact] = true;
            
            _contactDetails[contact] = SecurityContact({
                contactAddress: contact,
                isActive: true,
                responseCount: 0,
                addedAt: block.timestamp
            });

            emit SecurityContactAdded(contact, block.timestamp);
        }
    }

    /**
     * @dev Remove security contact (admin only)
     * @param contact Security contact address
     */
    function removeSecurityContact(address contact) 
        external 
        override 
        onlyOwner 
    {
        if (_isSecurityContact[contact]) {
            _isSecurityContact[contact] = false;
            _contactDetails[contact].isActive = false;

            // Remove from array
            for (uint256 i = 0; i < _securityContacts.length; i++) {
                if (_securityContacts[i] == contact) {
                    _securityContacts[i] = _securityContacts[_securityContacts.length - 1];
                    _securityContacts.pop();
                    break;
                }
            }

            emit SecurityContactRemoved(contact, block.timestamp);
        }
    }

    /**
     * @dev Get all active security contacts
     * @return contacts Array of security contact addresses
     */
    function getSecurityContacts() 
        external 
        view 
        override 
        returns (address[] memory) 
    {
        return _securityContacts;
    }

    /**
     * @dev Send alert to security contacts
     * @param escrow Escrow contract address
     * @param message Alert message
     */
    function sendSecurityAlert(
        address escrow,
        string calldata message
    ) 
        external 
        override 
        onlyAuthorized 
    {
        _notifySecurityContacts(escrow, message);
    }

    /**
     * @dev Calculate lock extension for emergency
     * @param escrow Escrow contract address
     * @return extension Lock extension duration in seconds
     */
    function calculateLockExtension(address escrow) 
        external 
        view 
        override 
        returns (uint256) 
    {
        // Base extension from config
        uint256 extension = _config.lockExtension;

        // Add extra time if multiple emergencies
        EmergencyRecord memory record = _emergencyRecords[escrow];
        if (record.activatedAt > 0) {
            // Add 24 hours for each previous emergency
            uint256 previousEmergencies = _userActivations[record.activator].length;
            if (previousEmergencies > 1) {
                extension += (previousEmergencies - 1) * 24 hours;
            }
        }

        // Cap at 7 days maximum
        if (extension > 7 days) {
            extension = 7 days;
        }

        return extension;
    }

    /**
     * @dev Authorize a caller (admin only)
     * @param caller Address to authorize
     * @param authorized Authorization status
     */
    function setAuthorizedCaller(address caller, bool authorized) 
        external 
        onlyOwner 
    {
        _authorizedCallers[caller] = authorized;
    }

    /**
     * @dev Check if address is authorized
     * @param caller Address to check
     * @return authorized True if authorized
     */
    function isAuthorized(address caller) 
        external 
        view 
        returns (bool) 
    {
        return _authorizedCallers[caller] || caller == owner();
    }
    
    /**
     * @dev Get last activation time for debugging
     */
    function getLastActivation(address user) external view returns (uint256) {
        return _lastActivation[user];
    }
    

    // === Internal Functions ===

    /**
     * @dev Get recent activation count for a user (within 24 hours)
     */
    function _getRecentActivationCount(address user) 
        internal 
        view 
        returns (uint256) 
    {
        uint256 count = 0;
        uint256 cutoff = block.timestamp - 24 hours;
        
        uint256[] memory activations = _userActivations[user];
        for (uint256 i = 0; i < activations.length; i++) {
            if (activations[i] > cutoff) {
                count++;
            }
        }
        
        return count;
    }

    /**
     * @dev Notify security contacts about emergency
     */
    function _notifySecurityContacts(address escrow, string memory message) 
        internal 
    {
        if (_securityContacts.length == 0) {
            // No contacts to notify, but don't revert
            return;
        }

        // Emit alert events for each contact
        for (uint256 i = 0; i < _securityContacts.length; i++) {
            if (_contactDetails[_securityContacts[i]].isActive) {
                emit AlertSent(escrow, _securityContacts[i], block.timestamp);
            }
        }
    }

    /**
     * @dev Authorize upgrade (UUPS)
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOwner 
    {}

    /**
     * @dev Check if caller is a valid escrow contract
     * @param caller Address to validate
     * @return valid True if valid escrow
     */
    function _isValidEscrow(address caller) internal view returns (bool) {
        if (_factory == address(0)) {
            return false; // Factory not set
        }
        
        // Simple validation: check if caller is a contract and has escrow-like functions
        if (caller.code.length == 0) {
            return false; // Not a contract
        }
        
        // Try calling a basic escrow function to validate it's an escrow contract
        try IEscrow(caller).getState() returns (IEscrowStructs.EscrowState) {
            return true; // If it can return a state, it's likely an escrow
        } catch {
            return false;
        }
    }

    /**
     * @dev Get module version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}