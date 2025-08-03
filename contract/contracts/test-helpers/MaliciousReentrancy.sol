// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IEscrow.sol";

/**
 * @title MaliciousReentrancy
 * @dev A test contract that attempts reentrancy attacks on escrow fund releases
 * @dev Used for testing the reentrancy protection in EscrowImplementation
 */
contract MaliciousReentrancy {
    address public target;
    bool public attacking = false;
    uint256 public attackCount = 0;
    uint256 public maxAttacks = 3;

    event AttackAttempted(uint256 count);
    event AttackCompleted(bool success);

    /**
     * @dev Set the target escrow to attack
     */
    function setTarget(address _target) external {
        target = _target;
    }

    /**
     * @dev Set maximum number of attack attempts
     */
    function setMaxAttacks(uint256 _max) external {
        maxAttacks = _max;
    }

    /**
     * @dev Initiate attack by calling releaseFunds
     */
    function attack() external {
        require(target != address(0), "Target not set");
        attacking = true;
        attackCount = 0;
        
        try IEscrow(target).releaseFunds() {
            emit AttackCompleted(true);
        } catch {
            emit AttackCompleted(false);
        }
        
        attacking = false;
    }

    /**
     * @dev Receive function that attempts reentrancy
     */
    receive() external payable {
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            emit AttackAttempted(attackCount);
            
            // Attempt reentrancy
            try IEscrow(target).releaseFunds() {
                // If this succeeds, the reentrancy protection failed
            } catch {
                // Expected behavior - reentrancy should be blocked
            }
        }
    }

    /**
     * @dev Fallback function
     */
    fallback() external payable {
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            emit AttackAttempted(attackCount);
        }
    }

    /**
     * @dev Get the current balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Withdraw any received ETH
     */
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}