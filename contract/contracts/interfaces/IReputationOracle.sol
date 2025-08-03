// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IReputationOracle
 * @dev Interface for reputation management system
 */
interface IReputationOracle {
    // === Functions ===
    
    /**
     * @dev Get user's reputation score (0-100)
     * @param user The user address
     * @return The reputation score
     */
    function getReputationScore(address user) external view returns (uint256);
    
    /**
     * @dev Record a completed trade
     * @param user The user address
     * @param amount The trade amount
     * @param successful Whether the trade was successful
     */
    function recordTrade(
        address user,
        uint256 amount,
        bool successful
    ) external;
    
    /**
     * @dev Record a dispute involving user
     * @param disputant The user who raised the dispute
     * @param defendant The user the dispute is against
     * @param disputantWon Whether the disputant won
     */
    function recordDispute(
        address disputant,
        address defendant,
        bool disputantWon
    ) external;
    
    /**
     * @dev Get detailed reputation data
     * @param user The user address
     * @return score The reputation score
     * @return totalTrades Total number of trades
     * @return successRate Success rate percentage
     * @return totalVolume Total trading volume
     * @return joinedTimestamp When user first traded
     */
    function getReputationData(address user) external view returns (
        uint256 score,
        uint256 totalTrades,
        uint256 successRate,
        uint256 totalVolume,
        uint256 joinedTimestamp
    );
    
    /**
     * @dev Check if user is trustworthy based on reputation
     * @param user The user address
     * @return Whether the user is trustworthy
     */
    function isTrustworthy(address user) external view returns (bool);
}