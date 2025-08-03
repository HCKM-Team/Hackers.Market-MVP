# Hackers.Market: User Flow Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [User Personas](#2-user-personas)
   - [2.1 Primary Personas](#21-primary-personas)
   - [2.2 Secondary Personas](#22-secondary-personas)
3. [Core User Flows](#3-core-user-flows)
   - [3.1 Onboarding Flow](#31-onboarding-flow)
     - [3.1.1 Initial Registration](#311-initial-registration)
     - [3.1.2 Security Configuration](#312-security-configuration)
   - [3.2 Seller Flow](#32-seller-flow)
     - [3.2.1 Listing Creation](#321-listing-creation)
     - [3.2.2 Order Management](#322-order-management)
   - [3.3 Buyer Flow](#33-buyer-flow)
     - [3.3.1 Discovery & Purchase](#331-discovery--purchase)
     - [3.3.2 Trade Execution](#332-trade-execution)
   - [3.4 Emergency Flow](#34-emergency-flow)
     - [3.4.1 Panic Button Activation](#341-panic-button-activation)
     - [3.4.2 Post-Emergency](#342-post-emergency)
   - [3.5 Dispute Resolution Flow](#35-dispute-resolution-flow)
     - [3.5.1 Dispute Initiation](#351-dispute-initiation)
     - [3.5.2 Resolution Process](#352-resolution-process)
4. [Cross-Chain Operations](#4-cross-chain-operations)
   - [4.1 Multi-Chain Balance Management](#41-multi-chain-balance-management)
   - [4.2 Cross-Chain Transactions](#42-cross-chain-transactions)
5. [Mobile Experience](#5-mobile-experience)
   - [5.1 Progressive Web App](#51-progressive-web-app)
   - [5.2 Mobile-Specific Features](#52-mobile-specific-features)
6. [Security Checkpoints](#6-security-checkpoints)
   - [6.1 Transaction Security](#61-transaction-security)
   - [6.2 Account Security](#62-account-security)
   - [6.3 KYC Security Levels](#63-kyc-security-levels)

---

## 1. Overview

This document outlines the complete user journey through Hackers.Market, focusing on the anti-coercion P2P escrow protocol. Each flow prioritizes security while maintaining seamless user experience across multi-chain operations. All users must complete on-chain KYC verification to ensure platform safety.

## 2. User Personas

### 2.1 Primary Personas

**Crypto Trader (Sarah)**
- Trades $5,000-50,000 per transaction
- Values security and privacy-preserving verification
- Experienced with DeFi protocols
- Uses multiple chains regularly

**Digital Goods Seller (Mike)**
- Sells software licenses and digital assets
- Processes 20-50 transactions monthly
- Needs automated escrow management
- Prioritizes dispute protection

**P2P Merchant (Lisa)**
- Operates physical goods marketplace
- Handles high-value transactions ($10,000+)
- Requires anti-coercion features
- Needs multi-currency support

### 2.2 Secondary Personas

**Casual Buyer**
- Occasional purchases under $1,000
- Limited crypto experience
- Mobile-first usage
- Values simplicity

**Enterprise Client**
- B2B transactions over $100,000
- Requires API integration
- Needs compliance features
- Multi-signature approvals

## 3. Core User Flows

### 3.1 Onboarding Flow

#### 3.1.1 Initial Registration
1. **Landing Page** → Click "Get Started"
2. **Wallet Connection**
   - Select wallet provider (RainbowKit integration)
   - Approve connection across preferred chains
   - Auto-detect multi-chain balances
3. **Mandatory On-Chain KYC Verification**
   - **Primary Method: Gitcoin Passport (Humanpass)**
     - Connect existing Passport or create new
     - System checks aggregated score
     - Minimum score of 20+ required
     - Higher scores unlock better rates
   - **Alternative Aggregated Providers**:
     - Holonym (privacy-preserving KYC)
     - Polygon ID (zero-knowledge proofs)
     - BrightID (social verification)
     - WorldID (biometric proof of personhood)
   - **Verification Process**:
     - On-chain attestation check
     - Score aggregation from multiple sources
     - Sybil resistance verification
     - Human verification confirmation
4. **Profile Setup**
   - Username creation (ENS optional)
   - Select primary trading chains
   - Set notification preferences

#### 3.1.2 Security Configuration
1. **Emergency Contact Setup**
   - Add trusted contact (optional but recommended)
   - Configure panic button
   - Generate emergency codes
2. **2FA Activation**
   - Enable authenticator app
   - Backup recovery codes
   - Test emergency activation

### 3.2 Seller Flow

#### 3.2.1 Listing Creation
1. **Dashboard** → "Create Listing"
   - Humanpass score displayed prominently
2. **Item Details**
   - Title and description
   - Category selection
   - Price in multiple currencies (USDC/EURC/native)
   - Upload images to IPFS
3. **Escrow Configuration**
   - Select accepted chains
   - Set time-lock duration (auto-calculated based on Humanpass score)
   - Configure dispute terms
   - Set minimum buyer Humanpass score requirement
4. **Smart Contract Deployment**
   - Review gas fees across chains
   - Deploy via EscrowFactory
   - Share listing URL

#### 3.2.2 Order Management
1. **Notification** → "New Order Received"
2. **Buyer Verification**
   - Automatic Humanpass score check
   - View aggregated verification stamps
   - Check reputation score
   - Review trade history
3. **Order Acceptance**
   - Confirm order details
   - Initiate meeting (if physical)
   - Start secure chat
4. **Delivery Confirmation**
   - Mark item as delivered
   - Upload proof (photos/tracking)
   - Wait for buyer confirmation

### 3.3 Buyer Flow

#### 3.3.1 Discovery & Purchase
1. **Browse/Search** → Find item
   - Filter by seller Humanpass score
   - View required verification level for each listing
2. **Item Review**
   - Check seller verification badges
   - View on-chain attestations
   - Review escrow terms
   - Calculate total with fees
3. **Pre-Purchase Check**
   - System verifies buyer meets Humanpass requirements
   - If insufficient, prompt to improve score via additional stamps
4. **Chain Selection**
   - View balance across chains
   - Compare gas costs
   - 1inch optimization for best rate
5. **Fund Escrow**
   - Approve token spending
   - Confirm transaction
   - Receive order confirmation

#### 3.3.2 Trade Execution
1. **Order Tracking**
   - Real-time status updates
   - Secure messaging with seller
   - Countdown timer display
2. **Receipt Confirmation**
   - Inspect goods/services
   - Confirm satisfaction
   - Release funds (after time-lock)
3. **Feedback**
   - Rate transaction
   - Update reputation scores
   - Report issues if any

### 3.4 Emergency Flow

#### 3.4.1 Panic Button Activation
1. **Threat Detection** → Access emergency menu
2. **Quick Actions**
   - Single tap: Extend lock 24 hours
   - Double tap: Extend lock 72 hours
   - Long press: Full emergency mode
3. **Verification**
   - Enter panic code
   - Biometric confirmation
   - Silent alarm triggered

#### 3.4.2 Post-Emergency
1. **Safety Check**
   - Platform contacts user after 24 hours
   - Re-verify identity through on-chain attestation
   - Review incident
2. **Resolution Options**
   - Continue with extended timeline
   - Initiate dispute process
   - Cancel transaction with penalty

### 3.5 Dispute Resolution Flow

#### 3.5.1 Dispute Initiation
1. **Transaction Page** → "Report Issue"
2. **Identity Verification**
   - On-chain attestation check to prevent abuse
3. **Issue Classification**
   - Item not as described
   - Non-delivery
   - Quality issues
   - Suspected fraud
4. **Evidence Submission**
   - Upload photos/videos
   - Provide detailed description
   - Set resolution expectations

#### 3.5.2 Resolution Process
1. **Automated Analysis**
   - AI reviews evidence
   - Considers Humanpass scores of both parties
   - Pattern matching with past disputes
   - Preliminary decision
2. **Community Review** (if needed)
   - Case presented to verified jury pool
   - Only users with Humanpass score 50+ can participate
   - Anonymous voting period
   - Weighted by reputation and verification level
3. **Final Decision**
   - Funds distribution
   - Reputation adjustments
   - Appeal option (requires higher Humanpass score)

## 4. Cross-Chain Operations

### 4.1 Multi-Chain Balance Management
1. **Unified Dashboard**
   - Total portfolio value
   - Chain-by-chain breakdown
   - Quick swap interface
   - KYC status synchronized across chains
2. **Intelligent Routing**
   - Best chain for transaction
   - Gas optimization
   - Liquidity considerations

### 4.2 Cross-Chain Transactions
1. **Automatic Bridging**
   - Seamless USDC/EURC transfers via CCTP
   - LayerZero OFT for HMT tokens
   - Progress tracking
2. **Fee Optimization**
   - Pay in any token
   - 1inch routing for best rates
   - Batch transaction options

## 5. Mobile Experience

### 5.1 Progressive Web App
- **Instant Access**: No app store required
- **Push Notifications**: Transaction alerts
- **Offline Mode**: View past transactions
- **Biometric Login**: FaceID/Fingerprint

### 5.2 Mobile-Specific Features
- **QR Code Trading**: Quick in-person exchanges with verified users
- **Mobile Verification**: Direct Humanpass stamp collection
- **Location Services**: Find nearby verified traders (optional)
- **One-Tap Emergency**: Prominent panic button

## 6. Security Checkpoints

### 6.1 Transaction Security
- **Pre-Trade Verification**: Mandatory on-chain KYC checks for both parties
- **During Trade Monitoring**: Anomaly detection
- **Post-Trade Protection**: Time-locked releases

### 6.2 Account Security
- **Login Protection**: 2FA mandatory after KYC completion
- **Session Management**: Auto-logout and re-authentication
- **Activity Monitoring**: Suspicious behavior alerts
- **Recovery Options**: On-chain attestation-based recovery

### 6.3 KYC Security Levels
- **Level 1**: Humanpass score 20+ (minimum requirement)
- **Level 2**: Humanpass score 50+ (reduced fees)
- **Level 3**: Humanpass score 75+ (premium features)
- **Level 4**: Humanpass score 90+ (lowest fees, highest limits)

**Score Boosting Methods**:
- Connect multiple verification stamps
- Complete social verifications
- Add on-chain activity proofs
- Maintain good platform reputation

---

**Note**: On-chain KYC verification through aggregated protocols like Gitcoin Passport (Humanpass) is mandatory for all users. This ensures platform safety while preserving user privacy through decentralized attestations. The anti-coercion mechanisms work in conjunction with on-chain identity verification to provide maximum security for all participants.