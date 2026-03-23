import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { Horizon, TransactionBuilder, Networks, BASE_FEE, Operation, Asset, Transaction } from "@stellar/stellar-sdk";

// Initialize Horizon context for Testnet
export const server = new Horizon.Server("https://horizon-testnet.stellar.org");

export const checkFreighterConnection = async (): Promise<boolean> => {
  if (typeof window !== "undefined") {
    const res = await isConnected();
    return res.isConnected;
  }
  return false;
};

export const connectWallet = async (): Promise<string | null> => {
  try {
    const res = await requestAccess();
    if (res.error) {
      console.error("Failed to connect wallet:", res.error);
      return null;
    }
    return res.address || null;
  } catch (error) {
    console.error("Unexpected error connecting wallet:", error);
    return null;
  }
};

export const fetchBalance = async (publicKey: string): Promise<string> => {
  try {
    const account = await server.loadAccount(publicKey);
    const nativeBalance = account.balances.find((b: any) => b.asset_type === "native");
    return nativeBalance ? nativeBalance.balance : "0";
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    return "0";
  }
};

export const sendTransaction = async (
  fromPublicKey: string,
  toPublicKey: string,
  amount: string
): Promise<string> => {
  try {
    // 1. Load the sender account to get current sequence number
    const account = await server.loadAccount(fromPublicKey);

    // 2. Build the transaction
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: toPublicKey,
          asset: Asset.native(),
          amount: amount,
        })
      )
      .setTimeout(30)
      .build();

    // 3. Sign the transaction using Freighter
    const xdr = tx.toXDR();
    const res = await signTransaction(xdr, { networkPassphrase: Networks.TESTNET });

    if (res.error) {
      throw new Error(res.error.toString());
    }

    // 4. Submit the transaction to the Horizon network
    const signedTx = TransactionBuilder.fromXDR(
      res.signedTxXdr,
      Networks.TESTNET
    ) as Transaction;

    const response = await server.submitTransaction(signedTx);

    if (!response.successful) {
      throw new Error("Transaction submission failed on Stellar network.");
    }

    return response.hash;
  } catch (error: any) {
    console.error("Transaction failed:", error);
    throw new Error(error.message || "Unknown transaction error");
  }
};
