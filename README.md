# 🏦 Savings Vault — Stellar Orange Belt (Level 3)

A decentralized savings dApp built on Soroban. Lock your XLM on-chain and only withdraw when your savings goal is reached or a time lock expires. No banks, no trust required.

## 📝 Level 3 Features
- **On-Chain Asset Handling**: Real XLM deposits and withdrawals via the native Soroban token interface
- **Dual Unlock Mechanism**: Withdraw when goal is met OR when time lock expires — whichever comes first
- **Loading States**: Skeleton screens and transaction progress indicators
- **Caching**: 30-second localStorage cache for vault state — instant loads
- **5 Unit Tests**: Full coverage of create, deposit, withdraw (goal), withdraw (time), and early withdraw panic
- **Premium UI**: Circular SVG progress ring, glassmorphism card, smooth animations

## 🔗 Submission Requirements

- **Live Demo:** https://stellarlevel-dapp.vercel.app
- **Demo Video (1-min):** https://www.loom.com/share/4d860a52aa6945ee959b803e62bb855b
- **Test Output Screenshot:**
  > *(Take a screenshot of `cargo test` passing and add it here, e.g. `![Tests Passed](./tests-screenshot.png)`)*

## 🏁 Submission Checklist
- [x] Mini-dApp fully functional
- [x] Minimum 3 tests passing (5/5 tests)
- [x] README complete
- [x] Demo video recorded (1 min)
- [x] Public GitHub repository
- [x] 3+ meaningful commits

## 🛠️ Running Locally

### Smart Contract Tests
```bash
cd contracts/milestone
cargo test
```
Expected: `5 passed; 0 failed`

### Frontend
```bash
npm install
npm run dev
```

## 🔗 How It Works
1. **Create Vault** — Set a savings goal (XLM) and optional time-lock date
2. **Deposit** — Send XLM directly to the vault contract on-chain
3. **Withdraw** — Funds release only when the goal is met OR the date has passed
4. **Explorer** — Every transaction is verifiable on Stellar Expert Testnet
