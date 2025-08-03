// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ITimeLockModule.sol";

/**
 * @title TimeLockModule
 * @dev HCKM anti-coercion time-lock calculation module
 * @dev Calculates dynamic time-locks based on trade parameters and risk factors
 */
contract TimeLockModule is 
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ITimeLockModule 
{
    /// @dev Time-lock configuration
    TimeLockConfig private _config;

    /// @dev Authorized callers (factory and escrow contracts)
    mapping(address => bool) private _authorizedCallers;

    /// @dev Amount thresholds for time-lock tiers (in wei)
    uint256[] private _amountThresholds;
    
    /// @dev Corresponding durations for each threshold tier (in seconds)
    uint256[] private _durationTiers;

    /// @dev Storage gap for future upgrades
    uint256[46] private __gap;

    /**
     * @dev Modifier to check authorized callers
     */
    modifier onlyAuthorized() {
        if (!_authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    /**
     * @dev Initialize the module
     * @param owner_ Owner address
     */
    function initialize(address owner_) public initializer {
        __Ownable_init(owner_);
        __UUPSUpgradeable_init();

        // Set default configuration
        _config = TimeLockConfig({
            minDuration: 1 hours,
            maxDuration: 7 days,
            defaultDuration: 24 hours,
            emergencyExtension: 48 hours,
            disputeExtension: 72 hours
        });

        // Initialize default amount thresholds (in ETH for readability, stored in wei)
        _amountThresholds = new uint256[](5);
        _amountThresholds[0] = 0.01 ether;   // < 0.01 ETH
        _amountThresholds[1] = 0.1 ether;    // 0.01 - 0.1 ETH
        _amountThresholds[2] = 1 ether;      // 0.1 - 1 ETH
        _amountThresholds[3] = 10 ether;     // 1 - 10 ETH
        _amountThresholds[4] = 100 ether;    // > 10 ETH

        // Initialize corresponding duration tiers
        _durationTiers = new uint256[](6);
        _durationTiers[0] = 1 hours;     // Minimal amount: 1 hour
        _durationTiers[1] = 6 hours;     // Small amount: 6 hours
        _durationTiers[2] = 12 hours;    // Medium amount: 12 hours
        _durationTiers[3] = 24 hours;    // Standard amount: 24 hours
        _durationTiers[4] = 48 hours;    // Large amount: 48 hours
        _durationTiers[5] = 72 hours;    // Very large amount: 72 hours
    }

    /**
     * @dev Calculate time-lock duration based on trade factors
     * @param factors Trade-specific factors for calculation
     * @return duration Calculated time-lock duration in seconds
     */
    function calculateTimeLock(TimeLockFactors calldata factors) 
        external 
        view 
        override 
        returns (uint256 duration) 
    {
        // Start with base duration from amount
        duration = _getBaseDurationForAmount(factors.tradeAmount);

        // Apply reputation adjustment (-50% to +50%)
        duration = _applyReputationAdjustment(
            duration, 
            factors.sellerReputation, 
            factors.buyerReputation
        );

        // Apply trade history adjustment (-20% to +20%)
        duration = _applyTradeHistoryAdjustment(duration, factors.tradeCount);

        // Apply risk multiplier if high risk (+50% to +100%)
        if (factors.isHighRisk) {
            duration = (duration * 150) / 100; // +50% for high risk
        }

        // Apply KYC discount if verified (-20%)
        if (factors.hasKYC) {
            duration = (duration * 80) / 100; // -20% for KYC verified
        }

        // Ensure within bounds
        if (duration < _config.minDuration) {
            duration = _config.minDuration;
        } else if (duration > _config.maxDuration) {
            duration = _config.maxDuration;
        }

        return duration;
    }

    /**
     * @dev Get time-lock for a specific amount (simplified calculation)
     * @param amount Trade amount in wei
     * @return duration Time-lock duration in seconds
     */
    function getTimeLockForAmount(uint256 amount) 
        external 
        view 
        override 
        returns (uint256 duration) 
    {
        return _getBaseDurationForAmount(amount);
    }

    /**
     * @dev Get emergency extension duration
     * @return extension Emergency extension in seconds
     */
    function getEmergencyExtension() 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _config.emergencyExtension;
    }

    /**
     * @dev Get dispute extension duration
     * @return extension Dispute extension in seconds
     */
    function getDisputeExtension() 
        external 
        view 
        override 
        returns (uint256) 
    {
        return _config.disputeExtension;
    }

    /**
     * @dev Get current configuration
     * @return config Current time-lock configuration
     */
    function getConfig() 
        external 
        view 
        override 
        returns (TimeLockConfig memory) 
    {
        return _config;
    }

    /**
     * @dev Update time-lock configuration (admin only)
     * @param config New configuration parameters
     */
    function updateConfig(TimeLockConfig calldata config) 
        external 
        override 
        onlyOwner 
    {
        // Validate configuration
        if (config.minDuration == 0 || config.minDuration > config.maxDuration) {
            revert InvalidConfiguration();
        }
        if (config.defaultDuration < config.minDuration || 
            config.defaultDuration > config.maxDuration) {
            revert InvalidConfiguration();
        }
        if (config.emergencyExtension == 0 || config.disputeExtension == 0) {
            revert InvalidConfiguration();
        }

        _config = config;
        
        emit TimeLockConfigUpdated(
            config.minDuration,
            config.maxDuration,
            config.defaultDuration
        );
    }

    /**
     * @dev Check if a duration is valid
     * @param duration Duration to validate
     * @return valid True if duration is within bounds
     */
    function isValidDuration(uint256 duration) 
        external 
        view 
        override 
        returns (bool) 
    {
        return duration >= _config.minDuration && duration <= _config.maxDuration;
    }

    /**
     * @dev Apply risk multiplier to base duration
     * @param baseDuration Base time-lock duration
     * @param riskScore Risk score (0-10000, where 10000 = 100%)
     * @return adjustedDuration Duration after risk adjustment
     */
    function applyRiskMultiplier(uint256 baseDuration, uint256 riskScore) 
        external 
        pure 
        override 
        returns (uint256) 
    {
        if (riskScore > 10000) {
            riskScore = 10000; // Cap at 100%
        }
        
        // Apply risk as percentage increase (0-100% increase)
        uint256 riskAdjustment = (baseDuration * riskScore) / 10000;
        return baseDuration + riskAdjustment;
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
     * @dev Update amount thresholds and duration tiers (admin only)
     * @param thresholds New amount thresholds
     * @param durations New duration tiers (must be thresholds.length + 1)
     */
    function updateTiers(
        uint256[] calldata thresholds, 
        uint256[] calldata durations
    ) 
        external 
        onlyOwner 
    {
        if (durations.length != thresholds.length + 1) {
            revert InvalidConfiguration();
        }
        
        // Validate thresholds are in ascending order
        for (uint256 i = 1; i < thresholds.length; i++) {
            if (thresholds[i] <= thresholds[i-1]) {
                revert InvalidConfiguration();
            }
        }
        
        // Validate durations are within bounds
        for (uint256 i = 0; i < durations.length; i++) {
            if (durations[i] < _config.minDuration || 
                durations[i] > _config.maxDuration) {
                revert InvalidDuration();
            }
        }
        
        _amountThresholds = thresholds;
        _durationTiers = durations;
    }

    // === Internal Functions ===

    /**
     * @dev Get base duration for a given amount
     */
    function _getBaseDurationForAmount(uint256 amount) 
        internal 
        view 
        returns (uint256) 
    {
        // Find the appropriate tier
        for (uint256 i = 0; i < _amountThresholds.length; i++) {
            if (amount < _amountThresholds[i]) {
                return _durationTiers[i];
            }
        }
        // If amount exceeds all thresholds, use the highest tier
        return _durationTiers[_durationTiers.length - 1];
    }

    /**
     * @dev Apply reputation adjustment to duration
     * @param duration Base duration
     * @param sellerRep Seller reputation (0-10000)
     * @param buyerRep Buyer reputation (0-10000)
     * @return Adjusted duration
     */
    function _applyReputationAdjustment(
        uint256 duration,
        uint256 sellerRep,
        uint256 buyerRep
    ) 
        internal 
        pure 
        returns (uint256) 
    {
        // Average reputation (0-10000)
        uint256 avgRep = (sellerRep + buyerRep) / 2;
        
        // Map reputation to adjustment factor
        // 0-2500: +50% duration (low trust)
        // 2500-5000: +25% duration
        // 5000-7500: 0% adjustment (neutral)
        // 7500-10000: -25% duration (high trust)
        
        if (avgRep < 2500) {
            return (duration * 150) / 100; // +50%
        } else if (avgRep < 5000) {
            return (duration * 125) / 100; // +25%
        } else if (avgRep < 7500) {
            return duration; // No change
        } else {
            return (duration * 75) / 100; // -25%
        }
    }

    /**
     * @dev Apply trade history adjustment
     * @param duration Base duration
     * @param tradeCount Number of previous trades
     * @return Adjusted duration
     */
    function _applyTradeHistoryAdjustment(uint256 duration, uint256 tradeCount) 
        internal 
        pure 
        returns (uint256) 
    {
        // Reduce duration for experienced traders
        if (tradeCount == 0) {
            return (duration * 120) / 100; // +20% for first trade
        } else if (tradeCount < 5) {
            return (duration * 110) / 100; // +10% for new traders
        } else if (tradeCount < 20) {
            return duration; // No change
        } else if (tradeCount < 50) {
            return (duration * 90) / 100; // -10% for experienced
        } else {
            return (duration * 80) / 100; // -20% for very experienced
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
     * @dev Get module version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}