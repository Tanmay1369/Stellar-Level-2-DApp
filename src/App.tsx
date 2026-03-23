import React, { useState, useEffect } from "react";
import { checkFreighterConnection, connectWallet, fetchBalance, sendTransaction } from "./lib/stellar";

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [hasFreighter, setHasFreighter] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  // Transaction State
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    checkFreighterConnection().then((connected) => {
      setHasFreighter(connected);
    });
  }, []);

  const handleConnect = async () => {
    const key = await connectWallet();
    if (key) {
      setPublicKey(key);
      const bal = await fetchBalance(key);
      setBalance(bal);
    }
  };

  const handleDisconnect = () => {
    setPublicKey(null);
    setBalance(null);
    setToAddress("");
    setAmount("");
    setTxHash(null);
    setTxError(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;

    setTxLoading(true);
    setTxHash(null);
    setTxError(null);

    try {
      const hash = await sendTransaction(publicKey, toAddress, amount);
      setTxHash(hash);

      // Update balance automatically
      const bal = await fetchBalance(publicKey);
      setBalance(bal);
    } catch (error: any) {
      setTxError(error.message || "Failed to send transaction.");
    } finally {
      setTxLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full bg-neutral-900 shadow-xl rounded-2xl p-8 border border-neutral-800">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-cyan-400 bg-clip-text text-transparent mb-6 text-center">
          Stellar Testnet dApp
        </h1>

        {!publicKey ? (
          <div className="flex flex-col items-center">
            <p className="mb-6 text-neutral-400 text-center">
              Connect your Freighter wallet to interact with the Stellar Testnet.
            </p>
            <button
              onClick={handleConnect}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 transition font-semibold rounded-xl text-white shadow-lg shadow-purple-900/40 cursor-pointer"
            >
              Connect Wallet
            </button>
            {!hasFreighter && (
              <p className="mt-4 text-sm text-red-400 bg-red-900/20 px-4 py-2 rounded-lg border border-red-900/50">
                Freighter extension not detected. Please install it!
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col space-y-6">
            <div className="w-full bg-neutral-800 p-4 rounded-xl border border-neutral-700">
              <p className="text-xs text-neutral-400 mb-1 font-semibold uppercase tracking-wider">[Text Tag: WALLET_CONNECTED_UI]</p>
              <p className="font-mono text-cyan-400 text-sm break-all font-semibold">
                {publicKey}
              </p>
            </div>

            <div className="w-full bg-neutral-800 p-4 rounded-xl border border-neutral-700">
              <p className="text-xs text-neutral-400 mb-1 font-semibold uppercase tracking-wider">[Text Tag: BALANCE_DISPLAY_UI]</p>
              <p className="font-mono text-purple-400 text-2xl font-bold">
                {balance !== null ? `${balance} XLM` : "Loading..."}
              </p>
            </div>

            <div className="w-full h-px bg-neutral-800 my-4" />

            <form onSubmit={handleSend} className="w-full space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1 font-medium">Recipient Address</label>
                <input
                  type="text"
                  required
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  className="w-full py-2.5 px-3 bg-neutral-950 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:border-cyan-500 transition font-mono text-sm"
                  placeholder="G..."
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1 font-medium">Amount (XLM)</label>
                <input
                  type="number"
                  step="0.0000001"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full py-2.5 px-3 bg-neutral-950 border border-neutral-700 rounded-lg text-neutral-100 focus:outline-none focus:border-cyan-500 transition font-mono text-sm"
                  placeholder="1.0"
                />
              </div>

              <button
                type="submit"
                disabled={txLoading}
                className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-700 disabled:bg-neutral-800 disabled:text-neutral-500 transition font-bold rounded-xl text-white shadow-lg shadow-cyan-900/30 mt-2 cursor-pointer"
              >
                {txLoading ? "Building Transaction..." : "Send Transaction"}
              </button>
            </form>

            {txError && (
              <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-xl">
                <p className="text-sm text-red-400 break-words">{txError}</p>
              </div>
            )}

            {txHash && (
              <div className="p-4 bg-green-950/30 border border-green-900/50 rounded-xl">
                <p className="text-xs text-green-500/70 mb-1 font-semibold uppercase tracking-wider">[Text Tag: TRANSACTION_SUCCESS_UI]</p>
                <p className="text-sm text-green-400 font-medium mb-1">
                  Transaction Successful!
                </p>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 transition text-sm break-all font-mono underline decoration-cyan-400/30 underline-offset-2 block"
                >
                  {txHash}
                </a>
              </div>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full py-2.5 px-4 bg-transparent border border-neutral-700 hover:bg-neutral-800 transition font-semibold rounded-xl text-neutral-300 cursor-pointer"
            >
              Disconnect Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
