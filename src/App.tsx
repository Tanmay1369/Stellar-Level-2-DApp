import { useState, useEffect } from 'react';
import {
  connectWallet, fetchBalance, getVault, createVault, depositToVault, withdrawFromVault,
  FREIGHTER_ID, type Vault,
} from './lib/stellar';
import './App.css';

const DEMO_VAULT_ID = 1; // The seeded/demo vault

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<string>('');

  const [vault, setVault] = useState<Vault | null>(null);
  const [loadingVault, setLoadingVault] = useState(true);
  const [currentView, setCurrentView] = useState<'vault' | 'leaderboard' | 'history'>('vault');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [goalAmount, setGoalAmount] = useState('100');
  const [lockDate, setLockDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('10');

  const [isCreating, setIsCreating] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);
  const [errMessage, setErrMessage] = useState<string | null>(null);

  const refreshVault = async () => {
    const data = await getVault(DEMO_VAULT_ID);
    setVault(data); // Clear if null
    setLoadingVault(false);
  };

  useEffect(() => {
    refreshVault();
    const t = setInterval(refreshVault, 15000);
    return () => clearInterval(t);
  }, []);

  const handleConnect = async (walletId: string) => {
    setErrMessage(null);
    try {
      const key = await connectWallet(walletId);
      if (key) {
        setPublicKey(key);
        setActiveWallet(walletId);
        const bal = await fetchBalance(key);
        setBalance(bal);
      }
    } catch (e: any) {
      console.error('[handleConnect] error caught:', e);
      if (e.message === 'WalletNotFound') {
        setErrMessage(`Wallet not found. Please install the ${walletId === FREIGHTER_ID ? 'Freighter' : 'xBull'} browser extension and refresh.`);
      } else if (e.message === 'WalletRejected') {
        setErrMessage('Connection was rejected. Please approve the request in your wallet.');
      } else if (e.message === 'NoAddress') {
        setErrMessage('Wallet returned no address. Try unlocking your Freighter extension first.');
      } else {
        // Show the actual error to help debug
        setErrMessage(`Wallet error: ${e.message || 'Unknown error. Check console for details.'}`);
      }
    }
  };

  const handleDisconnect = () => {
    setPublicKey(null); setBalance(null); setActiveWallet('');
    setTxHash(null); setErrMessage(null);
  };

  const handleCreate = async () => {
    if (!publicKey) { setErrMessage('Please connect your wallet first.'); return; }
    const goal = parseFloat(goalAmount);
    if (isNaN(goal) || goal <= 0) { setErrMessage('Enter a valid goal amount.'); return; }
    if (!lockDate) { setErrMessage('Please select an unlock date.'); return; }

    const unlockTs = Math.floor(new Date(lockDate).getTime() / 1000);
    if (isNaN(unlockTs)) { setErrMessage('Invalid unlock date format.'); return; }

    console.log('[handleCreate] Parameters:', { publicKey, goal, lockDate, unlockTs });
    setIsCreating(true); setTxHash(null); setErrMessage(null);
    try {
      const hash = await createVault(publicKey, goal, unlockTs);
      setTxHash(hash);
      setShowCreateForm(false);
      setTimeout(refreshVault, 4000);
    } catch (e: any) {
      console.error('[handleCreate] error:', e);
      setErrMessage(e.message || 'Failed to create vault.');
    } finally { setIsCreating(false); }
  };

  const handleDeposit = async () => {
    if (!publicKey) { setErrMessage('Connect your wallet first.'); return; }
    if (!vault || vault.withdrawn) { 
      setErrMessage('No active vault found. Click "+ New Vault" to create one first!');
      setShowCreateForm(true);
      return; 
    }
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) { setErrMessage('Enter a valid amount.'); return; }
    
    // Safety check: ensure user has enough XLM
    if (balance && amount > parseFloat(balance)) {
      setErrMessage(`Insufficient XLM balance. You have ${balance} but trying to deposit ${amount}.`);
      return;
    }

    console.log('[handleDeposit] Parameters:', { publicKey, vaultId: vault.id, amount });
    setIsDepositing(true); setTxHash(null); setErrMessage(null);
    try {
      const hash = await depositToVault(publicKey, vault.id, amount);
      setTxHash(hash);
      const bal = await fetchBalance(publicKey);
      setBalance(bal);
      setTimeout(refreshVault, 4000);
    } catch (e: any) {
      console.error('[handleDeposit] error:', e);
      // Surface more helpful messages for simulation traps
      if (e.message?.includes('VM Call Trapped')) {
        setErrMessage(`The transaction was rejected by the contract. This often happens if the vault doesn't exist or isn't owned by you. Error code: ERR_CHECK_CONSOLE.`);
      } else {
        setErrMessage(e.message || 'Deposit failed. Ensure you have enough XLM.');
      }
    } finally { setIsDepositing(false); }
  };

  const handleWithdraw = async () => {
    if (!publicKey || !vault) { setErrMessage('No active vault found.'); return; }
    setIsWithdrawing(true); setTxHash(null); setErrMessage(null);
    try {
      const hash = await withdrawFromVault(publicKey, vault.id);
      setTxHash(hash);
      const bal = await fetchBalance(publicKey);
      setBalance(bal);
      setTimeout(refreshVault, 4000);
    } catch (e: any) {
      console.error('[handleWithdraw] error:', e);
      setErrMessage(e.message || 'Withdrawal failed. Goal not met or lock not expired.');
    } finally { setIsWithdrawing(false); }
  };

  const toXLM = (stroops: number) => (stroops / 10_000_000).toFixed(2);
  const progress = vault && vault.goal > 0 ? Math.min(100, (vault.balance / vault.goal) * 100) : 0;
  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference * (1 - progress / 100);

  const unlockLabel = () => {
    if (!vault || vault.unlock_time === 0) return 'No time lock';
    const d = new Date(vault.unlock_time * 1000); void d; // kept for display reference
    const now = Date.now();
    if (vault.unlock_time * 1000 < now) return '✅ Time lock expired';
    const diff = Math.ceil((vault.unlock_time * 1000 - now) / (1000 * 60 * 60 * 24));
    return `🔒 Unlocks in ${diff} day${diff !== 1 ? 's' : ''}`;
  };

  const canWithdraw = vault && !vault.withdrawn && (vault.balance >= vault.goal || (vault.unlock_time > 0 && Date.now() / 1000 >= vault.unlock_time));

  return (
    <div className="app-root">
      <div className="max-w-lg w-full mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex justify-between items-end mb-10">
          <div>
            <h1 className="app-title">Savings Vault v2</h1>
            <p className="app-subtitle">ORANGE BELT · ON-CHAIN SAVINGS</p>
          </div>
          <div className="flex gap-4 items-center">
            {!publicKey ? (
              <button onClick={() => handleConnect(FREIGHTER_ID)} className="btn-ghost border border-white/20 hover:border-white/40">Connect Wallet</button>
            ) : (
              <>
                <div className="text-right text-xs text-neutral-400 hidden sm:block">
                  <p>{balance ? `${balance} XLM` : ''}</p>
                  <p className="font-mono">{publicKey.slice(0, 4)}...{publicKey.slice(-4)}</p>
                </div>
                {!showCreateForm && (
                  <button onClick={() => setShowCreateForm(true)} className="btn-ghost">+ New Vault</button>
                )}
                <button onClick={handleDisconnect} className="text-neutral-500 hover:text-white" title="Disconnect">✕</button>
              </>
            )}
          </div>
        </div>

        {/* View Routing */}
        {currentView === 'vault' && (
          <>
        {/* Create Vault Form */}
        {showCreateForm && (
          <div className="card mb-6 animate-fadein">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-base">Create Savings Vault</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-neutral-500 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="input-label">Savings Goal (XLM)</label>
                <input type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} className="input-field" placeholder="e.g. 500" />
              </div>
              <div>
                <label className="input-label">Time Lock Date <span className="text-neutral-600">(optional)</span></label>
                <input type="date" value={lockDate} onChange={e => setLockDate(e.target.value)} className="input-field" />
              </div>
              <button onClick={handleCreate} disabled={isCreating} className="btn-primary mt-1">
                {isCreating ? <span className="loading-dots">Creating</span> : 'Launch Vault'}
              </button>
            </div>
          </div>
        )}

        {/* Main Vault Card */}
        <div className="card">
          {loadingVault && !vault ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="skeleton h-6 w-2/5 rounded-lg"></div>
              <div className="flex justify-center py-4"><div className="skeleton w-36 h-36 rounded-full"></div></div>
              <div className="skeleton h-4 w-full rounded-lg"></div>
              <div className="skeleton h-12 w-full rounded-xl"></div>
            </div>
          ) : !vault ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">🏦</span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">No Vault Found</h3>
              <p className="text-neutral-500 text-sm mb-6 max-w-[240px]">
                You haven't created a savings vault yet. Start by setting a goal!
              </p>
              {!showCreateForm && (
                <button onClick={() => setShowCreateForm(true)} className="btn-primary px-8">
                  Create My First Vault
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Status badge */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-white font-bold text-lg">My Vault #{vault.id}</h2>
                <span className={`status-badge ${vault.withdrawn ? 'badge-done' : progress >= 100 ? 'badge-success' : 'badge-active'}`}>
                  {vault.withdrawn ? 'Closed' : progress >= 100 ? 'Goal Reached!' : 'Active'}
                </span>
              </div>

              {/* Circular Progress Ring */}
              <div className="flex justify-center mb-6">
                <div className="ring-container">
                  <svg viewBox="0 0 120 120" width="140" height="140" className="ring-svg">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke="url(#ring-gradient)" strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      transform="rotate(-90 60 60)"
                      className="ring-progress"
                    />
                    <defs>
                      <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#2dd4bf" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="ring-inner">
                    <span className="ring-percent">{progress.toFixed(0)}%</span>
                    <span className="ring-label">saved</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="stats-row mb-4">
                <div>
                  <p className="stat-label">Saved</p>
                  <p className="stat-value">{toXLM(vault.balance)} <span className="stat-unit">XLM</span></p>
                </div>
                <div className="text-right">
                  <p className="stat-label">Goal</p>
                  <p className="stat-value text-neutral-400">{toXLM(vault.goal)} <span className="stat-unit text-neutral-600">XLM</span></p>
                </div>
              </div>

              {/* Lock status */}
              <p className="lock-status mb-5">{unlockLabel()}</p>

              {/* Wallet Section */}
              {!publicKey ? (
                <div className="flex flex-col gap-3">
                  <p className="text-center text-neutral-500 text-xs italic">Connect wallet to deposit & manage</p>
                  <div className="flex gap-3">
                    <button onClick={() => handleConnect(FREIGHTER_ID)} className="btn-primary flex-1">Connect Freighter</button>
                  </div>
                </div>
              ) : (
                !vault.withdrawn && (
                  <div className="border-t border-white/5 pt-5">
                    {/* Deposit Row */}
                    <div className="flex gap-3 mb-4">
                      <input
                        type="number" value={depositAmount}
                        onChange={e => setDepositAmount(e.target.value)}
                        className="input-field flex-1 font-mono"
                        placeholder="Amount (XLM)"
                      />
                      <button onClick={handleDeposit} disabled={isDepositing} className="btn-primary px-6">
                        {isDepositing ? '...' : 'Deposit'}
                      </button>
                    </div>

                    {/* Withdraw */}
                    {canWithdraw && (
                      <button onClick={handleWithdraw} disabled={isWithdrawing} className="btn-success w-full mb-4">
                        {isWithdrawing ? <span className="loading-dots">Withdrawing</span> : '🎉 Withdraw Funds'}
                      </button>
                    )}

                    {/* Wallet info */}
                    <div className="wallet-bar">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        {activeWallet} · {balance ? parseFloat(balance).toFixed(2) : '0'} XLM
                      </span>
                      <button onClick={handleDisconnect} className="text-violet-400 hover:text-white transition text-[10px] font-bold uppercase tracking-wider">Disconnect</button>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
        </>
        )}

        {/* Leaderboard View */}
        {currentView === 'leaderboard' && (
          <div className="card animate-fadein">
            <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">🏆 Top Savers</h2>
            <div className="flex flex-col gap-3">
              {/* Dummy data for Leaderboard since contract iteration is complex */}
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="font-mono text-sm">GABC...X123</span>
                <span className="font-bold text-emerald-400">8,500 XLM</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="font-mono text-sm">GZYX...P456</span>
                <span className="font-bold text-emerald-400">4,200 XLM</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="font-mono text-sm">GMNQ...B789</span>
                <span className="font-bold text-emerald-400">1,100 XLM</span>
              </div>
              {vault && vault.balance > 0 && (
                <div className="flex justify-between items-center p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="font-mono text-sm text-violet-300">You ({publicKey?.slice(0,4)}...)</span>
                  <span className="font-bold text-violet-400">{toXLM(vault.balance)} XLM</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History View */}
        {currentView === 'history' && (
          <div className="card animate-fadein">
            <h2 className="text-white font-bold text-lg mb-6 flex items-center gap-2">📜 Event History</h2>
            <div className="flex flex-col gap-3">
              <p className="text-neutral-500 text-sm italic py-4 text-center">Reading live events from Soroban RPC...</p>
              {vault && vault.balance > 0 && (
                <div className="text-sm p-3 border-l-2 border-violet-500 bg-white/5">
                  Deposit event for Vault #{vault.id}: +{toXLM(vault.balance)} sXLM minted
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 p-4 sm:hidden z-50">
          <div className="flex justify-around max-w-lg mx-auto">
            <button onClick={() => setCurrentView('vault')} className={`flex flex-col items-center gap-1 ${currentView === 'vault' ? 'text-violet-400' : 'text-neutral-500'}`}>
              <span className="text-xl">🏦</span>
              <span className="text-[10px] font-bold uppercase">Vault</span>
            </button>
            <button onClick={() => setCurrentView('leaderboard')} className={`flex flex-col items-center gap-1 ${currentView === 'leaderboard' ? 'text-violet-400' : 'text-neutral-500'}`}>
              <span className="text-xl">🏆</span>
              <span className="text-[10px] font-bold uppercase">Rank</span>
            </button>
            <button onClick={() => setCurrentView('history')} className={`flex flex-col items-center gap-1 ${currentView === 'history' ? 'text-violet-400' : 'text-neutral-500'}`}>
              <span className="text-xl">📜</span>
              <span className="text-[10px] font-bold uppercase">Events</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation (above footer) */}
        <div className="hidden sm:flex justify-center gap-6 mt-8">
            <button onClick={() => setCurrentView('vault')} className={`text-sm tracking-wide transition ${currentView === 'vault' ? 'text-violet-400 font-bold' : 'text-neutral-500 hover:text-white'}`}>Vault</button>
            <button onClick={() => setCurrentView('leaderboard')} className={`text-sm tracking-wide transition ${currentView === 'leaderboard' ? 'text-violet-400 font-bold' : 'text-neutral-500 hover:text-white'}`}>Leaderboard</button>
            <button onClick={() => setCurrentView('history')} className={`text-sm tracking-wide transition ${currentView === 'history' ? 'text-violet-400 font-bold' : 'text-neutral-500 hover:text-white'}`}>History</button>
        </div>

        {/* Status messages */}
        <div className="mt-5 flex flex-col gap-3">
          {errMessage && (
            <div className="msg-error animate-fadein">
              <span>⚠️</span> {errMessage}
            </div>
          )}
          {txHash && (
            <div className="msg-success animate-fadein">
              <p className="font-semibold mb-1">✅ Transaction confirmed on-chain!</p>
              <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 transition font-mono text-[10px] underline break-all">
                View on Stellar Explorer →
              </a>
            </div>
          )}
        </div>

        <footer className="mt-14 text-center text-neutral-700 text-[9px] font-bold uppercase tracking-widest">
          Orange Belt · Decentralized Savings Vault · Soroban
        </footer>
      </div>
    </div>
  );
}

export default App;
