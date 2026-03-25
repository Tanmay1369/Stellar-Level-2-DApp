import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { rpc, TransactionBuilder, Networks, Contract, Keypair, xdr } from '@stellar/stellar-sdk';

// Initialize the Soroban RPC Server
export const server = new rpc.Server('https://soroban-testnet.stellar.org');
export const CONTRACT_ID = 'CDRZCJDK7G5U4PBKLTPQL4ENKLPHHJJ4A75G6OFPKBPFPHIDRP73GDUC';

export const FREIGHTER_ID = 'freighter';
export const XBULL_ID = 'xbull';

// Initialize StellarWalletsKit using Static init
StellarWalletsKit.init({
  network: "TESTNET" as any,
  selectedWalletId: FREIGHTER_ID,
  modules: [new FreighterModule(), new xBullModule()],
});

/** Wait for a transaction to complete */
async function pollTransactionStatus(txHash: string) {
  let status = await server.getTransaction(txHash);
  while ((status.status as any) === 'NOT_FOUND' || (status.status as any) === 'PENDING') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await server.getTransaction(txHash);
  }
  return status;
}

export const connectWallet = async (walletId = FREIGHTER_ID): Promise<string | null> => {
  try {
    StellarWalletsKit.setWallet(walletId);
    // request access by explicitly asking the specific wallet module
    const res = await (StellarWalletsKit as any).selectedModule.getAddress();
    return res.address;
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : typeof error === 'object' && error !== null ? error.error || error.message || JSON.stringify(error) : String(error);
    if (errMsg.includes("not installed") || errMsg.includes("not found")) {
      throw new Error("WalletNotFound");
    }
    if (errMsg.includes("rejected") || errMsg.includes("User declined")) {
      throw new Error("WalletRejected");
    }
    console.error("Error connecting wallet:", errMsg);
    return null;
  }
};

/** Fetch the user's XLM balance to check for Insufficient Balance */
export const fetchBalance = async (publicKey: string): Promise<string> => {
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`);
    const data = await res.json();
    if (data.status === 404) return "0";
    const native = data.balances?.find((b: any) => b.asset_type === 'native');
    return native ? native.balance : "0";
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return "0";
  }
};

/** Fetch current votes from the smart contract */
export const getPollVotes = async (): Promise<{ yes: number; no: number }> => {
  try {
    const contract = new Contract(CONTRACT_ID);
    const dummyAccount = Keypair.random().publicKey();

    let tx = new TransactionBuilder(await server.getAccount(dummyAccount).catch(() => null) || {
      accountId: () => dummyAccount,
      sequenceNumber: () => "0",
      incrementSequenceNumber: () => { }
    } as any, { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call('get_votes'))
      .setTimeout(30)
      .build();

    const simRes = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(simRes) && simRes.result && simRes.result.retval) {
      const value = simRes.result.retval.value() as unknown as any[];
      // value is an array of ScVals if it's a Tuple
      // get_votes returns (u32, u32) Tuple
      if (Array.isArray(value) && value.length >= 2) {
        const votes = {
          yes: value[0].u32(),
          no: value[1].u32()
        };
        console.log("Fetched votes:", votes);
        return votes;
      }
    }
    console.warn("Simulation failed or retval missing in getPollVotes");
    return { yes: 0, no: 0 };
  } catch (error) {
    console.error("Failed to fetch votes:", error);
    return { yes: 0, no: 0 };
  }
};

/** Cast a vote: Yes (true) or No (false) */
export const castVote = async (publicKey: string, voteYes: boolean): Promise<string> => {
  try {
    const minBalance = 2.0;
    const balance = await fetchBalance(publicKey);
    if (parseFloat(balance) < minBalance) {
      throw new Error("InsufficientBalance");
    }

    const accountRes = await server.getAccount(publicKey);
    const contract = new Contract(CONTRACT_ID);

    const voterVal = xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(xdr.PublicKey.publicKeyTypeEd25519(Keypair.fromPublicKey(publicKey).rawPublicKey())));
    const boolVal = xdr.ScVal.scvBool(voteYes);

    let tx = new TransactionBuilder(accountRes, { fee: '100000', networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call('vote', voterVal, boolVal))
      .setTimeout(30)
      .build();

    const simRes = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simRes)) {
      if (simRes.error) throw new Error(simRes.error);
      throw new Error("Simulation failed. You may have already voted.");
    }

    const preparedTx = await server.prepareTransaction(tx);

    const { signedTxXdr } = await StellarWalletsKit.signTransaction(preparedTx.toXDR(), {
      networkPassphrase: Networks.TESTNET,
    });

    const signedTxBuilt = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
    const submitRes = await server.sendTransaction(signedTxBuilt);

    if (submitRes.status === 'ERROR') {
      throw new Error("Submit failed.");
    }

    const status = await pollTransactionStatus(submitRes.hash);
    if (status.status === 'SUCCESS') {
      return submitRes.hash;
    } else {
      throw new Error(`Transaction failed: ${status.status}`);
    }
  } catch (error: any) {
    const errMsg = String(error);
    if (errMsg.includes("rejected") || errMsg.includes("User declined")) {
      throw new Error("WalletRejected");
    }
    if (errMsg.includes("UnreachableCodeReached") || errMsg.includes("InvalidAction")) {
      throw new Error("Simulation failed: You may have already voted with this wallet, or the contract rejected the call.");
    }
    throw error;
  }
};
