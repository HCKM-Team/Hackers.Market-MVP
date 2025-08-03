// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IReputationOracle.sol";

/**
 * @title ReputationOracle
 * @dev Cross-platform reputation system for HCKM traders
 * @dev Aggregates reputation from multiple sources and platforms
 */
contract ReputationOracle is 
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IReputationOracle 
{
    // === Structs ===
    
    struct ReputationConfig {
        uint256 minTradesForScore;      // Minimum trades to calculate score
        uint256 scoreDecayPeriod;       // Period for score decay (months)
        uint256 maxPenaltyPoints;       // Maximum penalty for violations
        bool crossPlatformEnabled;      // Enable cross-platform aggregation
    }

    struct UserReputation {
        uint256 totalTrades;            // Total completed trades
        uint256 successfulTrades;       // Successfully completed trades
        uint256 totalVolume;            // Total trading volume in ETH
        uint256 disputesRaised;         // Number of disputes raised
        uint256 disputesAgainst;        // Number of disputes against user
        uint256 penaltyPoints;          // Accumulated penalty points
        uint256 lastTradeTimestamp;     // Last trade timestamp
        uint256 joinedTimestamp;        // When user first traded
    }

    struct ReputationSource {
        string platform;                // Platform name (e.g., "LocalBitcoins")
        address oracle;                 // Oracle contract address
        uint256 weight;                 // Weight in aggregation (0-100)
        bool isActive;                  // Whether source is active
    }

    // === State Variables ===
    
    ReputationConfig private _config;
    mapping(address => UserReputation) private _userReputations;
    mapping(string => ReputationSource) private _sources;
    mapping(address => bool) private _authorizedUpdaters;
    
    string[] private _activeSources;
    uint256 private _totalUsers;
    
    // === Events ===
    
    event ReputationUpdated(
        address indexed user,
        uint256 newScore,
        string reason
    );
    
    event TradeCompleted(
        address indexed user,
        uint256 amount,
        bool successful
    );
    
    event SourceAdded(
        string indexed platform,
        address oracle,
        uint256 weight
    );
    
    event PenaltyApplied(
        address indexed user,
        uint256 points,
        string reason
    );

    // === Modifiers ===
    
    modifier onlyAuthorizedUpdater() {
        require(_authorizedUpdaters[msg.sender], "Not authorized updater");
        _;
    }

    // === Initialization ===
    
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();
        
        // Set default configuration
        _config = ReputationConfig({
            minTradesForScore: 5,           // Need 5+ trades for score
            scoreDecayPeriod: 12 * 30 days, // 12 months decay period
            maxPenaltyPoints: 100,          // Max 100 penalty points
            crossPlatformEnabled: true      // Enable cross-platform by default
        });
        
        _totalUsers = 0;
        
        // Add factory as authorized updater
        _authorizedUpdaters[msg.sender] = true;
    }

    // === External Functions ===
    
    /**
     * @dev Get user's reputation score (0-100)
     */
    function getReputationScore(address user) external view override returns (uint256) {
        UserReputation memory rep = _userReputations[user];
        
        if (rep.totalTrades < _config.minTradesForScore) {
            return 50; // Neutral score for new users
        }
        
        // Base score from success rate (0-80 points, leaving room for bonuses)
        uint256 successRate = (rep.successfulTrades * 80) / rep.totalTrades;
        
        // Apply volume bonus (max 10 points)
        uint256 volumeBonus = _calculateVolumeBonus(rep.totalVolume);
        
        // Apply time decay (max 10 points deduction)
        uint256 timeDecay = _calculateTimeDecay(rep.lastTradeTimestamp);
        
        // Apply penalties (max 30 points deduction)
        uint256 penaltyDeduction = (rep.penaltyPoints * 30) / _config.maxPenaltyPoints;
        
        // Calculate final score: base + bonus - penalties - decay
        uint256 score = successRate + volumeBonus;
        uint256 totalDeductions = timeDecay + penaltyDeduction;
        
        if (score > totalDeductions) {
            score = score - totalDeductions;
        } else {
            score = 10; // Minimum score
        }
        
        // Ensure score is within bounds
        if (score > 100) score = 100;
        if (score < 10) score = 10;
        
        return score;
    }
    
    /**
     * @dev Record a completed trade
     */
    function recordTrade(
        address user,
        uint256 amount,
        bool successful
    ) external override onlyAuthorizedUpdater {
        UserReputation storage rep = _userReputations[user];
        
        if (rep.joinedTimestamp == 0) {
            rep.joinedTimestamp = block.timestamp;
            _totalUsers++;
        }
        
        rep.totalTrades++;
        rep.totalVolume += amount;
        rep.lastTradeTimestamp = block.timestamp;
        
        if (successful) {
            rep.successfulTrades++;
        }
        
        emit TradeCompleted(user, amount, successful);
        emit ReputationUpdated(user, this.getReputationScore(user), "Trade completed");
    }
    
    /**
     * @dev Record a dispute involving user
     */
    function recordDispute(
        address disputant,
        address defendant,
        bool disputantWon
    ) external override onlyAuthorizedUpdater {
        _userReputations[disputant].disputesRaised++;
        _userReputations[defendant].disputesAgainst++;
        
        // Apply penalty to losing party
        if (disputantWon) {
            _applyPenalty(defendant, 10, "Lost dispute");
        } else {
            _applyPenalty(disputant, 5, "Invalid dispute");
        }
    }
    
    /**
     * @dev Get detailed reputation data
     */
    function getReputationData(address user) external view override returns (
        uint256 score,
        uint256 totalTrades,
        uint256 successRate,
        uint256 totalVolume,
        uint256 joinedTimestamp
    ) {
        UserReputation memory rep = _userReputations[user];
        
        score = this.getReputationScore(user);
        totalTrades = rep.totalTrades;
        successRate = rep.totalTrades > 0 ? (rep.successfulTrades * 100) / rep.totalTrades : 0;
        totalVolume = rep.totalVolume;
        joinedTimestamp = rep.joinedTimestamp;
    }
    
    /**
     * @dev Check if user is trustworthy based on reputation
     */
    function isTrustworthy(address user) external view override returns (bool) {
        uint256 score = this.getReputationScore(user);
        UserReputation memory rep = _userReputations[user];
        
        // Require minimum score and trade history, and low penalty points
        return score >= 70 && 
               rep.totalTrades >= _config.minTradesForScore &&
               rep.penaltyPoints < (_config.maxPenaltyPoints / 2); // Less than 50% max penalty
    }
    
    // === Admin Functions ===
    
    /**
     * @dev Add reputation source
     */
    function addReputationSource(
        string calldata platform,
        address oracle,
        uint256 weight
    ) external onlyOwner {
        require(oracle != address(0), "Invalid oracle");
        require(weight <= 100, "Weight too high");
        
        _sources[platform] = ReputationSource({
            platform: platform,
            oracle: oracle,
            weight: weight,
            isActive: true
        });
        
        _activeSources.push(platform);
        
        emit SourceAdded(platform, oracle, weight);
    }
    
    /**
     * @dev Add authorized updater
     */
    function addAuthorizedUpdater(address updater) external onlyOwner {
        _authorizedUpdaters[updater] = true;
    }
    
    /**
     * @dev Remove authorized updater
     */
    function removeAuthorizedUpdater(address updater) external onlyOwner {
        _authorizedUpdaters[updater] = false;
    }
    
    /**
     * @dev Apply penalty to user
     */
    function applyPenalty(
        address user,
        uint256 points,
        string calldata reason
    ) external onlyOwner {
        _applyPenalty(user, points, reason);
    }
    
    // === Internal Functions ===
    
    function _calculateVolumeBonus(uint256 totalVolume) internal pure returns (uint256) {
        if (totalVolume >= 100 ether) return 10;
        if (totalVolume >= 50 ether) return 7;
        if (totalVolume >= 10 ether) return 5;
        if (totalVolume >= 1 ether) return 2;
        return 0;
    }
    
    function _calculateTimeDecay(uint256 lastTradeTimestamp) internal view returns (uint256) {
        if (lastTradeTimestamp == 0) return 0;
        
        uint256 timeSinceLastTrade = block.timestamp - lastTradeTimestamp;
        uint256 decayPeriod = _config.scoreDecayPeriod;
        
        if (timeSinceLastTrade >= decayPeriod) {
            return 20; // Max 20 point decay
        }
        
        return (timeSinceLastTrade * 20) / decayPeriod;
    }
    
    function _applyPenalty(address user, uint256 points, string memory reason) internal {
        UserReputation storage rep = _userReputations[user];
        
        if (rep.penaltyPoints + points <= _config.maxPenaltyPoints) {
            rep.penaltyPoints += points;
        } else {
            rep.penaltyPoints = _config.maxPenaltyPoints;
        }
        
        emit PenaltyApplied(user, points, reason);
        emit ReputationUpdated(user, this.getReputationScore(user), reason);
    }
    
    // === View Functions ===
    
    function getConfig() external view returns (ReputationConfig memory) {
        return _config;
    }
    
    function getTotalUsers() external view returns (uint256) {
        return _totalUsers;
    }
    
    function isAuthorizedUpdater(address updater) external view returns (bool) {
        return _authorizedUpdaters[updater];
    }
}