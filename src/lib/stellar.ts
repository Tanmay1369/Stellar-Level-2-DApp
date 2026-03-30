import { isConnected, getAddress, isAllowed, setAllowed, signTransaction } from '@stellar/freighter-api';
import { nativeToScVal, rpc, TransactionBuilder, Networks, Contract, Keypair, xdr, Address } from '@stellar/stellar-sdk';

export const server = new rpc.Server('https://soroban-testnet.stellar.org');

// The savings vault contract ID — deployed to testnet
export const VAULT_CONTRACT_ID = 'CCPBT4GJWM7ZNPF2GKV6AWPNAU5RSOJ576VACZTVHIEV5NHBLRMISMJC';

// Native XLM on Testnet
const NATIVE_TOKEN = 'CDLZFC3SYJYDUI7K3YAD7FSZVE3OZRMLSXM2BCS2A3OTIOBBS4S5CIZ7';

export const FREIGHTER_ID = 'freighter';

// Freighter for signing transactions (direct API)
// xBull support removed for simplicity and reliability in Orange Belt submission

export interface Vault {
  id: number;
  owner: string;
  goal: number;
  balance: number;
  unlock_time: number;
  withdrawn: boolean;
}

async function pollTx(hash: string) {
  let status = await server.getTransaction(hash);
  while ((status.status as any) === 'NOT_FOUND' || (status.status as any) === 'PENDING') {
    await new Promise(r => setTimeout(r, 2000));
    status = await server.getTransaction(hash);
  }
  return status;
}

/** Connect wallet — uses Freighter API directly for reliability */
export const connectWallet = async (walletId = FREIGHTER_ID): Promise<string | null> => {
  // Use Freighter API directly for reliable connection
  if (walletId !== FREIGHTER_ID) throw new Error('Only Freighter is supported currently');

  // Use Freighter API directly for reliable connection
  try {
    const connected = await isConnected();
    if (!connected) {
      throw new Error('WalletNotFound');
    }

    // Request permission if not already allowed
    const allowed = await isAllowed();
    if (!allowed) {
      await setAllowed();
    }

    const result = await getAddress();
    if (result && 'error' in result && result.error) {
      const errMsg = String(result.error).toLowerCase();
      if (errMsg.includes('reject') || errMsg.includes('denied') || errMsg.includes('cancel')) {
        throw new Error('WalletRejected');
      }
      throw new Error(result.error);
    }
    
    const address = result && 'address' in result ? result.address : null;
    if (!address) throw new Error('NoAddress');
    return address;
  } catch (e: any) {
    if (e.message === 'WalletNotFound' || e.message === 'WalletRejected' || e.message === 'NoAddress') {
      throw e;
    }
    console.error('[connectWallet]', e);
    throw new Error(e?.message || 'Unknown error connecting Freighter');
  }
};

export const fetchBalance = async (publicKey: string): Promise<string> => {
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
    const data = await res.json();
    if (data.status === 404) return '0';
    const native = data.balances?.find((b: any) => b.asset_type === 'native');
    return native ? native.balance : '0';
  } catch {
    return '0';
  }
};

// Cache helpers
const CACHE_KEY = 'savings_vault_cache';
const getCache = () => JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
const setCache = (id: number, data: any) => {
  const c = getCache();
  c[id] = { ...data, ts: Date.now() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(c));
};

export const getVault = async (vaultId: number): Promise<Vault | null> => {
  const cache = getCache();
  if (cache[vaultId] && Date.now() - cache[vaultId].ts < 30000) return cache[vaultId];

  try {
    const contract = new Contract(VAULT_CONTRACT_ID);
    const dummy = Keypair.random().publicKey();

    const tx = new TransactionBuilder(
      await server.getAccount(dummy).catch(() => ({
        accountId: () => dummy,
        sequenceNumber: () => '0',
        incrementSequenceNumber: () => {},
      })) as any,
      { fee: '100', networkPassphrase: Networks.TESTNET }
    )
      .addOperation(contract.call('get_vault', xdr.ScVal.scvU32(vaultId)))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      // Clear cache if simulation fails (likely vault not found)
      const c = getCache();
      delete c[vaultId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
      return null;
    }

    const map = (sim.result.retval as any).map() as any[];
    if (!map) {
      const c = getCache();
      delete c[vaultId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
      return null;
    }

    const find = (key: string) => {
      const e = map?.find((m: any) => {
        try { return m.key().sym().toString() === key; } catch { return false; }
      });
      return e ? e.val() : null;
    };

    const ownerRes = find('owner');
    if (!ownerRes) return null; // If owner is missing, the vault entry is invalid

    const vault: Vault = {
      id: vaultId,
      owner: ownerRes.address().toString(),
      goal: Number((find('goal') as any)?.i128()?.lo() || 0), // Assuming goal fits in Number for display
      balance: Number((find('balance') as any)?.i128()?.lo() || 0),
      unlock_time: Number(find('unlock_time')?.u64() || 0),
      withdrawn: find('withdrawn')?.b() || false,
    };
    setCache(vaultId, vault);
    return vault;
  } catch (e) {
    console.warn('[getVault] error:', e);
    return null;
  }
};

export const initVaultContract = async (publicKey: string): Promise<void> => {
  try {
    const acc = await server.getAccount(publicKey);
    const contract = new Contract(VAULT_CONTRACT_ID);
    const tx = new TransactionBuilder(acc, { fee: '100000', networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call('init', Address.fromString(NATIVE_TOKEN).toScVal()))
      .setTimeout(30)
      .build();
    const prep = await server.prepareTransaction(tx);
    const result = await signTransaction(prep.toXDR(), { networkPassphrase: Networks.TESTNET });
    if (result.error) throw new Error(result.error);
    const sub = await server.sendTransaction(TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET));
    await pollTx(sub.hash);
  } catch (e: any) {
    if (!e?.message?.includes('Already initialized')) {
      console.error('[initVaultContract] Failed:', e?.message);
      throw e; // Rethrow so the UI can notify the user if initialization is required but failing
    }
  }
};

export const createVault = async (publicKey: string, goalXLM: number, unlockTimestamp: number): Promise<string> => {
  const acc = await server.getAccount(publicKey);
  const contract = new Contract(VAULT_CONTRACT_ID);
  const goalStroops = Math.round(goalXLM * 10_000_000);

  const tx = new TransactionBuilder(acc, { fee: '100000', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call(
      'create_vault',
      Address.fromString(publicKey).toScVal(),
      nativeToScVal(BigInt(goalStroops), { type: 'i128' }),
      nativeToScVal(BigInt(unlockTimestamp), { type: 'u64' }),
    ))
    .setTimeout(30)
    .build();

  const prep = await server.prepareTransaction(tx);

  // Pre-flight simulation for deep debugging
  const sim = (await server.simulateTransaction(prep)) as any;
  if (!rpc.Api.isSimulationSuccess(sim)) {
    console.error('[createVault] Simulation failed. Details:', sim);
    throw new Error('Vault creation failed verification. Check console for ERR_ codes.');
  }

  const result = await signTransaction(prep.toXDR(), { networkPassphrase: Networks.TESTNET });
  if (result.error) throw new Error(result.error);
  const sub = await server.sendTransaction(TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET));
  await pollTx(sub.hash);
  return sub.hash;
};

export const depositToVault = async (publicKey: string, vaultId: number, amountXLM: number): Promise<string> => {
  const acc = await server.getAccount(publicKey);
  const contract = new Contract(VAULT_CONTRACT_ID);
  const amountStroops = Math.round(amountXLM * 10_000_000);

  const tx = new TransactionBuilder(acc, { fee: '100000', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call(
      'deposit',
      Address.fromString(publicKey).toScVal(),
      nativeToScVal(vaultId, { type: 'u32' }),
      nativeToScVal(BigInt(amountStroops), { type: 'i128' }),
    ))
    .setTimeout(30)
    .build();

  const prep = await server.prepareTransaction(tx);

  // Pre-flight simulation for deep debugging
  const sim = (await server.simulateTransaction(prep)) as any;
  if (!rpc.Api.isSimulationSuccess(sim)) {
    console.error('[depositToVault] Simulation failed. Details:', sim);
    // Simulation success result has the retval, but failure has events
    const msg = 'VM Call Trapped';
    throw new Error(`${msg}. Check browser console for ERR_ codes.`);
  }

  const result = await signTransaction(prep.toXDR(), { networkPassphrase: Networks.TESTNET });
  if (result.error) throw new Error(result.error);
  const sub = await server.sendTransaction(TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET));
  await pollTx(sub.hash);

  const c = getCache();
  delete c[vaultId];
  localStorage.setItem(CACHE_KEY, JSON.stringify(c));

  return sub.hash;
};

export const withdrawFromVault = async (publicKey: string, vaultId: number): Promise<string> => {
  const acc = await server.getAccount(publicKey);
  const contract = new Contract(VAULT_CONTRACT_ID);

  const tx = new TransactionBuilder(acc, { fee: '100000', networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call('withdraw', nativeToScVal(vaultId, { type: 'u32' })))
    .setTimeout(30)
    .build();

  const prep = await server.prepareTransaction(tx);

  // Pre-flight simulation for deep debugging
  const sim = (await server.simulateTransaction(prep)) as any;
  if (!rpc.Api.isSimulationSuccess(sim)) {
    console.error('[withdrawFromVault] Simulation failed. Details:', sim);
    throw new Error('Withdrawal failed verification. Check console for ERR_ codes.');
  }

  const result = await signTransaction(prep.toXDR(), { networkPassphrase: Networks.TESTNET });
  if (result.error) throw new Error(result.error);
  const sub = await server.sendTransaction(TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET));
  await pollTx(sub.hash);
  return sub.hash;
};
