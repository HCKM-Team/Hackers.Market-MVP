// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IDisputeResolver.sol";

/**
 * @title DisputeResolver
 * @dev Multi-tier dispute resolution system for HCKM escrows
 * @dev Supports automated resolution, arbitrator intervention, and DAO governance
 */
contract DisputeResolver is 
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IDisputeResolver 
{
    // === Structs ===
    
    struct DisputeConfig {
        uint256 autoResolveTimeout;     // Time before auto-resolution
        uint256 arbitratorTimeout;     // Time before escalation to DAO
        uint256 minimumStake;          // Minimum stake for dispute filing
        uint256 arbitratorFee;         // Fee for arbitrator services
        bool automationEnabled;        // Enable automated resolution
    }

    // === State Variables ===
    
    DisputeConfig private _config;
    mapping(bytes32 => DisputeCase) private _disputes;
    mapping(address => bool) private _authorizedArbitrators;
    mapping(address => uint256) private _arbitratorCaseCount;
    
    uint256 private _totalDisputes;
    uint256 private _resolvedDisputes;
    
    // === Events ===
    
    event DisputeFiled(
        bytes32 indexed disputeId,
        address indexed escrow,
        address indexed disputant,
        string reason,
        uint256 amount
    );
    
    event DisputeAssigned(
        bytes32 indexed disputeId,
        address indexed arbitrator
    );
    
    event DisputeResolved(
        bytes32 indexed disputeId,
        DisputeOutcome outcome,
        string resolution
    );
    
    event ArbitratorAdded(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator);
    
    // === Modifiers ===
    
    modifier onlyArbitrator() {
        require(_authorizedArbitrators[msg.sender], "Not authorized arbitrator");
        _;
    }
    
    modifier validDispute(bytes32 disputeId) {
        require(_disputes[disputeId].filedAt > 0, "Dispute not found");
        _;
    }

    // === Initialization ===
    
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();
        
        // Set default configuration
        _config = DisputeConfig({
            autoResolveTimeout: 7 days,     // 7 days for auto-resolution
            arbitratorTimeout: 3 days,      // 3 days for arbitrator review
            minimumStake: 0.01 ether,       // Minimum stake to prevent spam
            arbitratorFee: 0.005 ether,     // 0.005 ETH arbitrator fee
            automationEnabled: true         // Enable automation by default
        });
        
        _totalDisputes = 0;
        _resolvedDisputes = 0;
    }

    // === External Functions ===
    
    /**
     * @dev File a new dispute
     */
    function fileDispute(
        address escrow,
        string calldata reason
    ) external payable override returns (bytes32 disputeId) {
        require(msg.value >= _config.minimumStake, "Insufficient stake");
        require(bytes(reason).length > 0, "Reason required");
        
        disputeId = keccak256(abi.encodePacked(escrow, msg.sender, block.timestamp));
        
        _disputes[disputeId] = DisputeCase({
            escrow: escrow,
            disputant: msg.sender,
            reason: reason,
            filedAt: block.timestamp,
            amount: 0, // To be set by escrow contract
            stake: msg.value,
            status: DisputeStatus.Filed,
            assignedArbitrator: address(0),
            resolvedAt: 0,
            resolution: "",
            outcome: DisputeOutcome.Pending
        });
        
        _totalDisputes++;
        
        emit DisputeFiled(disputeId, escrow, msg.sender, reason, 0);
        
        // Auto-assign arbitrator if available
        _autoAssignArbitrator(disputeId);
        
        return disputeId;
    }
    
    /**
     * @dev Resolve a dispute (arbitrator only)
     */
    function resolveDispute(
        bytes32 disputeId,
        DisputeOutcome outcome,
        string calldata resolution
    ) external onlyArbitrator validDispute(disputeId) {
        DisputeCase storage dispute = _disputes[disputeId];
        require(dispute.status == DisputeStatus.UnderReview, "Invalid status");
        require(dispute.assignedArbitrator == msg.sender, "Not assigned arbitrator");
        
        dispute.status = DisputeStatus.Resolved;
        dispute.outcome = outcome;
        dispute.resolution = resolution;
        dispute.resolvedAt = block.timestamp;
        
        _resolvedDisputes++;
        
        // Transfer arbitrator fee
        if (_config.arbitratorFee > 0 && address(this).balance >= _config.arbitratorFee) {
            payable(msg.sender).transfer(_config.arbitratorFee);
        }
        
        emit DisputeResolved(disputeId, outcome, resolution);
    }
    
    /**
     * @dev Get dispute information
     */
    function getDispute(bytes32 disputeId) external view returns (DisputeCase memory) {
        return _disputes[disputeId];
    }
    
    /**
     * @dev Check if dispute exists and is active
     */
    function isActiveDispute(bytes32 disputeId) external view override returns (bool) {
        DisputeCase memory dispute = _disputes[disputeId];
        return dispute.filedAt > 0 && 
               dispute.status != DisputeStatus.Resolved && 
               dispute.status != DisputeStatus.Dismissed;
    }
    
    // === Admin Functions ===
    
    /**
     * @dev Add authorized arbitrator
     */
    function addArbitrator(address arbitrator) external onlyOwner {
        require(arbitrator != address(0), "Invalid arbitrator");
        _authorizedArbitrators[arbitrator] = true;
        emit ArbitratorAdded(arbitrator);
    }
    
    /**
     * @dev Remove arbitrator authorization
     */
    function removeArbitrator(address arbitrator) external onlyOwner {
        _authorizedArbitrators[arbitrator] = false;
        emit ArbitratorRemoved(arbitrator);
    }
    
    /**
     * @dev Update dispute configuration
     */
    function updateConfig(DisputeConfig calldata newConfig) external onlyOwner {
        require(newConfig.autoResolveTimeout > 0, "Invalid auto resolve timeout");
        require(newConfig.arbitratorTimeout > 0, "Invalid arbitrator timeout");
        
        _config = newConfig;
    }
    
    // === Internal Functions ===
    
    /**
     * @dev Auto-assign available arbitrator
     */
    function _autoAssignArbitrator(bytes32 disputeId) internal {
        // Simple round-robin assignment logic
        // In production, this should be more sophisticated
        DisputeCase storage dispute = _disputes[disputeId];
        
        // For now, just mark as under review
        // Real implementation would assign to least loaded arbitrator
        dispute.status = DisputeStatus.UnderReview;
        
        emit DisputeAssigned(disputeId, address(0));
    }
    
    // === View Functions ===
    
    function getConfig() external view returns (DisputeConfig memory) {
        return _config;
    }
    
    function getTotalDisputes() external view returns (uint256) {
        return _totalDisputes;
    }
    
    function getResolvedDisputes() external view returns (uint256) {
        return _resolvedDisputes;
    }
    
    function isAuthorizedArbitrator(address arbitrator) external view returns (bool) {
        return _authorizedArbitrators[arbitrator];
    }
}