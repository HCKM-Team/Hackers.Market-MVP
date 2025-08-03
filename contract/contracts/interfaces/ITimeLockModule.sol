// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITimeLockModule
 * @dev Interface for the HCKM time-lock module that calculates anti-coercion delays
 */
interface ITimeLockModule {
    /**
     * @dev Time-lock configuration parameters
     */
    struct TimeLockConfig {
        uint256 minDuration;      // Minimum lock duration (e.g., 1 hour)
        uint256 maxDuration;      // Maximum lock duration (e.g., 7 days)
        uint256 defaultDuration;  // Default lock duration (e.g., 24 hours)
        uint256 emergencyExtension; // Extension for emergency (e.g., 48 hours)
        uint256 disputeExtension;  // Extension for disputes (e.g., 72 hours)
    }

    /**
     * @dev Factors for calculating dynamic time-lock
     */
    struct TimeLockFactors {
        uint256 tradeAmount;       // Trade value in wei
        uint256 sellerReputation;  // Seller reputation score (0-10000)
        uint256 buyerReputation;   // Buyer reputation score (0-10000)
        uint256 tradeCount;        // Number of previous trades
        bool isHighRisk;           // High-risk trade flag
        bool hasKYC;              // KYC verification status
    }

    /**
     * @dev Events
     */
    event TimeLockConfigUpdated(
        uint256 minDuration,
        uint256 maxDuration,
        uint256 defaultDuration
    );
    event TimeLockCalculated(
        address indexed escrow,
        uint256 duration,
        uint256 factors
    );
    event EmergencyExtensionApplied(
        address indexed escrow,
        uint256 extension
    );
    event DisputeExtensionApplied(
        address indexed escrow,
        uint256 extension
    );

    /**
     * @dev Errors
     */
    error InvalidDuration();
    error InvalidConfiguration();
    error UnauthorizedCaller();
    error InvalidFactors();

    /**
     * @dev Calculate time-lock duration based on trade factors
     * @param factors Trade-specific factors for calculation
     * @return duration Calculated time-lock duration in seconds
     */
    function calculateTimeLock(TimeLockFactors calldata factors) 
        external 
        view 
        returns (uint256 duration);

    /**
     * @dev Get time-lock for a specific amount (simplified calculation)
     * @param amount Trade amount in wei
     * @return duration Time-lock duration in seconds
     */
    function getTimeLockForAmount(uint256 amount) 
        external 
        view 
        returns (uint256 duration);

    /**
     * @dev Get emergency extension duration
     * @return extension Emergency extension in seconds
     */
    function getEmergencyExtension() 
        external 
        view 
        returns (uint256 extension);

    /**
     * @dev Get dispute extension duration
     * @return extension Dispute extension in seconds
     */
    function getDisputeExtension() 
        external 
        view 
        returns (uint256 extension);

    /**
     * @dev Get current configuration
     * @return config Current time-lock configuration
     */
    function getConfig() 
        external 
        view 
        returns (TimeLockConfig memory config);

    /**
     * @dev Update time-lock configuration (admin only)
     * @param config New configuration parameters
     */
    function updateConfig(TimeLockConfig calldata config) external;

    /**
     * @dev Check if a duration is valid
     * @param duration Duration to validate
     * @return valid True if duration is within bounds
     */
    function isValidDuration(uint256 duration) 
        external 
        view 
        returns (bool valid);

    /**
     * @dev Apply risk multiplier to base duration
     * @param baseDuration Base time-lock duration
     * @param riskScore Risk score (0-10000, where 10000 = 100%)
     * @return adjustedDuration Duration after risk adjustment
     */
    function applyRiskMultiplier(uint256 baseDuration, uint256 riskScore) 
        external 
        pure 
        returns (uint256 adjustedDuration);
}