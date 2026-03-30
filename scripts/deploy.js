import pkg from '@stellar/stellar-sdk';
const { Keypair, rpc, Networks, TransactionBuilder, Operation, Contract, Address } = pkg;
import fs from 'fs';

import crypto from 'crypto';

const server = new rpc.Server('https://soroban-testnet.stellar.org');
const networkPassphrase = Networks.TESTNET;

async function fundAccount(publicKey) {
    console.log(`Funding account ${publicKey}...`);
    try {
        await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
    } catch (e) {
        console.log("Friendbot request failed.");
    }
}

export async function deploy() {
    const keypair = Keypair.random();
    console.log(`Generated deployer account: ${keypair.publicKey()}`);
    console.log(`Secret key: ${keypair.secret()}`);
    await fundAccount(keypair.publicKey());

    await new Promise(r => setTimeout(r, 5000));

    let account;
    try {
        account = await server.getAccount(keypair.publicKey());
    } catch (e) {
        console.error("Account not found. Trying one more time after 5s...");
        await new Promise(r => setTimeout(r, 5000));
        account = await server.getAccount(keypair.publicKey());
    }

    const wasmPath = './contracts/milestone/target/wasm32-unknown-unknown/release/soroban_savings_vault.wasm';
    if (!fs.existsSync(wasmPath)) throw new Error(`WASM file not found at ${wasmPath}. Run cargo build first!`);
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmHash = crypto.createHash('sha256').update(wasmBuffer).digest();
    
    console.log("WASM Path:", wasmPath);
    console.log("Calculated WASM Hash:", wasmHash.toString('hex'));

    console.log("Uploading WASM...");
    let uploadTx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
        .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
        .setTimeout(30)
        .build();

    let preparedUpload = await server.prepareTransaction(uploadTx);
    preparedUpload.sign(keypair);
    let uploadRes = await server.sendTransaction(preparedUpload);
    
    if (uploadRes.status !== 'ERROR') {
        console.log("WASM upload submitted. Hash:", uploadRes.hash);
        await pollTransactionStatus(uploadRes.hash);
    } else {
        console.log("WASM upload status:", uploadRes.status);
    }

    console.log("Deploying Contract...");
    account = await server.getAccount(keypair.publicKey());
    
    let tx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
        .addOperation(Operation.createCustomContract({
            address: new Address(keypair.publicKey()),
            wasmHash: wasmHash
        }))
        .setTimeout(30)
        .build();

    let preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(keypair);

    console.log("Submitting Create Contract transaction...");
    let txRes = await server.sendTransaction(preparedTx);

    if (txRes.status === 'ERROR') {
        console.error("Deploy failed:", JSON.stringify(txRes, null, 2));
        throw new Error("Deploy failed");
    }

    const status = await pollTransactionStatus(txRes.hash);
    
    let contractId;
    try {
        const addrXdr = status.resultMetaXdr.v3().sorobanMeta().returnValue();
        contractId = Address.fromScVal(addrXdr).toString();
    } catch (e) {
        console.log("Standard extraction failed, trying fallback...");
        if (status.returnValue) {
            contractId = Address.fromScVal(status.returnValue).toString();
        } else {
            throw new Error("Could not extract Contract ID from transaction result.");
        }
    }
    
    console.log("Deploy successful!");
    console.log("NEW_CONTRACT_ID:", contractId);

    // Initialize with Native XLM immediately
    console.log("Initializing contract with Native XLM...");
    const { Asset } = pkg;
    const NATIVE_TOKEN = Asset.native().contractId(networkPassphrase);
    account = await server.getAccount(keypair.publicKey());
    const initContract = new Contract(contractId);
    let initTx = new TransactionBuilder(account, { fee: '1000000', networkPassphrase })
        .addOperation(initContract.call('init', Address.fromString(NATIVE_TOKEN).toScVal()))
        .setTimeout(30)
        .build();
    let preparedInit = await server.prepareTransaction(initTx);
    preparedInit.sign(keypair);
    let initRes = await server.sendTransaction(preparedInit);
    await pollTransactionStatus(initRes.hash);
    console.log("Initialization successful!");

    return contractId;
}

async function pollTransactionStatus(hash) {
    let status = await server.getTransaction(hash);
    while (status.status === 'NOT_FOUND' || status.status === 'PENDING') {
        await new Promise(r => setTimeout(r, 2000));
        status = await server.getTransaction(hash);
    }
    return status;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    deploy().catch(console.error);
}
