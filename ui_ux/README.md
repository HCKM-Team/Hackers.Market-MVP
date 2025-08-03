# HCKM UI/UX Design Process & Brief
## Hackers.Market - Decentralized P2P RWA Trading Platform

## 1. Project Overview

**HCKM (Hackers.Market)** is a decentralized peer-to-peer marketplace that enables secure trading of Real World Assets (RWA) through smart contract-based escrow services and integrated crypto payment gateways powered by 1inch.

### 1.1 Core Concept

The platform functions as a "decentralized eBay" or "Kleinanzeigen.de" with the following key differentiators:
- Smart contract-based automated escrow system
- DID-based KYC verification
- Cross-chain crypto payment gateway
- No tokenization of RWAs required
- Transparent and verifiable transactions

### 1.2 Target Categories

The platform supports three main asset categories:
1. **IRL Physical Goods** (e.g., second-hand electronics, hardware, merchandise)
2. **On-Chain Assets** (e.g., NFTs, tradable digital assets)
3. **Traditional Digital Products** (e.g., gift cards, redeemable codes)

---

## 2. UI/UX Design Process

### 2.1 Phase 1: Information Architecture & Site Mapping
- **Deliverable**: Rapid IA + Site Map in Figma
- **Status**: Completed by Eve on 2025/7/29
- **Link**: [HCKM UX FigJam Board](https://www.figma.com/board/WFS5AJbVCUNZUz7MOGwUjT/HCKM-UX?node-id=12-2&t=HMj8wi1bkJ7Qg2uf-1)

### 2.2 Phase 2: Component Design
- **Alert & Modal Systems**: Designed according to GitHub specifications
- **UI Component Library**: Started in Figma Design File
- **Link**: [HCKM UI Design File](https://www.figma.com/design/iRl2Lpq1k7n3eHVl8VNqqp/HCKM-UI?node-id=21-3&t=2xeAe8Tbpvn9bbHv-1)

### 2.3 Phase 3: User Flow Development
**Core User Flows Identified:**
1. **Onboarding Flow**
2. **Selling Flow**  
3. **Buying Flow**

**Detailed Documentation**: [User Flow Document](https://docs.google.com/document/d/1nELyVpkfoj4dwnnnfxvsjFTJ_hZ4zdhdkbDCQMKEuE4/edit?usp=sharing)

### 2.4 Phase 4: Landing Page Development
- **First Milestone**: Draft landing page completed
- **Link**: [Draft landing](https://genial-discussions-450408.framer.app/)
- **Status**: Built with Framer, includes placeholder images, still under building
- **Current State**: Under review and revision

---

## 3. Design References & Inspiration

### 3.1 Primary References
- **Binance P2P Marketplace**: For user flow patterns and trading interface
- **Carousell.sg**: For P2P trading UX with location-based meetups
- **Aconomy.io**: RWA trading platform reference

### 3.2 Key Differences from References
- Focus on RWA (not just crypto trading)
- Smart contract escrow (not human intermediaries)
- DID-based KYC system
- Cross-chain payment integration

---

## 4. Technical Integration Requirements

### 4.1 Blockchain Integration
- **Primary Chain**: Ethereum Sepolia Testnet
- **Secondary**: Base Sepolia Testnet
- **Bounty Target**: Etherlink L2 deployment

### 4.2 Third-Party Services

#### 4.2.1 1inch API Integration
- Limit Order Protocol
- Fusion/Fusion+ API
- Cross-chain swapping and bridging

#### 4.2.2 DID-Based KYC
- HumanPass integration
- Government ID verification (Level 2)
- Tiered access based on KYC completion

### 4.3 Smart Contract Architecture
- **EscrowFactory Contract**: Creates individual escrow instances
- **Individual Escrow Contracts**: Handle specific transactions
- **Automated Settlement**: No human intervention required

---

## 5. User Journey & KYC Levels

### 5.1 User Onboarding Process
1. **Landing Page**: Learn about platform capabilities
2. **Registration**: Wallet + email address
3. **Level 1 KYC**: DID-based verification (HumanPass)
4. **Level 2 KYC**: Government ID verification
5. **Terms Agreement**: Platform disclaimer and ToS
6. **Feature Unlock**: Access to platform functionalities

### 5.2 KYC Level Requirements
- **Level 1**: HumanPass score ≥20 + basic verification
- **Level 2**: Government ID verification
- **Progressive Unlock**: More features available with higher KYC levels

---

## 6. Messaging System Design

### 6.1 Internal Communication
- **Format**: Chat room-like interface (similar to instant messaging)
- **Restrictions**: Anti-spam measures (max 5 images per message)
- **Functionality**: Restricted internal messaging (not open chat)
- **Reference**: Similar to Binance P2P communication system

---

## 7. Revenue Model

### 7.1 Fee Structure
- **Escrow Fee**: 1%-2.5% of listing price
- **Transaction Fee**: 0.5%-1% for crypto swaps/exchanges
- **Free Features**: Browsing listings
- **Paid Features**: Posting listings

---

## 8. Development Priorities for Hackathon

### 8.1 Primary Target
- **1inch API Integration**: Extensive use for $30,000 bounty
- **Limit Order Protocol**: Implementation for $65,000 bounty
- **Etherlink Integration**: L2 deployment for $10,000 bounty

### 8.2 MVP Features for Demo
1. **Three Product Categories**: Physical goods, on-chain assets, digital products
2. **Complete User Flows**: Onboarding, selling, buying
3. **Smart Contract Escrow**: Functional prototype
4. **1inch Integration**: Working payment gateway
5. **KYC System**: Basic DID verification

---

## 9. Next Steps

### 9.1 Immediate Actions
1. **Finalize User Flows**: Complete documentation with team feedback
2. **UI Development**: Build responsive components based on flows
3. **Smart Contract Development**: Deploy and test escrow system
4. **Integration Testing**: 1inch API and Etherlink compatibility
5. **Landing Page Refinement**: Incorporate team feedback

### 9.2 Success Metrics
- **Technical**: Successful smart contract deployment on all target networks
- **UX**: Intuitive user flows with minimal friction
- **Integration**: Seamless 1inch API functionality
- **Compliance**: Robust KYC system implementation

---

*This design brief serves as the foundational document for the HCKM project development, ensuring alignment between design, development, and business objectives for the hackathon submission.*