# 🌟 Stellar Level 1 dApp — White Belt Challenge

A beginner-friendly Stellar Testnet dApp built with **React + Vite**, **Freighter Wallet**, and the **Stellar SDK**. Demonstrates core Stellar fundamentals: wallet connection, balance fetching, and XLM transactions.

---

## 📸 Screenshots

### 1. Wallet Connected
> `[Text Tag: WALLET_CONNECTED_UI]`

<!-- Replace the line below with your screenshot after running the app -->
![Wallet Connected](screenshots/wallet-connected.png)

---

### 2. Balance Displayed
> `[Text Tag: BALANCE_DISPLAY_UI]`

<!-- Replace the line below with your screenshot showing the XLM balance -->
![Balance Display](screenshots/balance-display.png)

---

### 3. Transaction Success
> `[Text Tag: TRANSACTION_SUCCESS_UI]`

<!-- Replace the line below with your screenshot showing a successful transaction and hash -->
![Transaction Success](screenshots/transaction-success.png)

---

### 4. Transaction on Stellar.Expert
<!-- Replace the line below with your Stellar.Expert screenshot -->
![Stellar Expert](screenshots/stellar-expert.png)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Freighter Wallet](https://freighter.app/) browser extension (set to **Testnet**)

### Installation

```bash
# Clone the repo
git clone https://github.com/Tanmay1369/Stellar-Level-1-DApp.git
cd Stellar-Level-1-DApp

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 How to Test

1. Install and open the **Freighter** browser extension
2. Switch Freighter network to **Testnet**
3. Fund your testnet wallet at [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#account-creator?network=test)
4. Click **Connect Wallet** in the app
5. Your XLM balance will appear automatically
6. Enter a recipient testnet address and amount, then hit **Send Transaction**
7. Approve the transaction in Freighter
8. View the success message and click the hash link to see it on Stellar.Expert

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React + Vite | Frontend framework |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| `@stellar/freighter-api` | Wallet connection & signing |
| `@stellar/stellar-sdk` | Transaction building |
| Horizon Testnet API | Balance & transaction submission |

---

## ✅ Level 1 Requirements Met

- [x] Freighter wallet integration (Testnet)
- [x] Connect & Disconnect wallet
- [x] Fetch and display XLM balance
- [x] Send XLM transaction on testnet
- [x] Transaction success/failure feedback
- [x] Transaction hash with Stellar.Expert link
- [x] Public GitHub repository

---

## 📁 Project Structure

```
src/
├── App.tsx          # Main UI with wallet + transaction logic
├── lib/
│   └── stellar.ts   # Freighter API + Stellar SDK utilities
├── main.tsx         # App entry point
└── index.css        # Tailwind CSS setup
```
