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

async function pollTransactionStatus(hash) {
    let status = await server.getTransaction(hash);
    while (status.status === 'NOT_FOUND' || status.status === 'PENDING') {
        await new Promise(r => setTimeout(r, 2000));
        status = await server.getTransaction(hash);
    }
    return status;
}

export async function deploy() {
    const keypair = Keypair.random();
    console.log(`Generated deployer account: ${keypair.publicKey()}`);
    console.log(`Secret key: ${keypair.secret()}`);
    await fundAccount(keypair.publicKey());

    // Give Friendbot time
    await new Promise(r => setTimeout(r, 5000));

    // Reusable Wasm deployment
    async function deployWasm(wasmPath) {
        let account;
        try {
            account = await server.getAccount(keypair.publicKey());
        } catch (e) {
            await new Promise(r => setTimeout(r, 5000));
            account = await server.getAccount(keypair.publicKey());
        }

        if (!fs.existsSync(wasmPath)) throw new Error(`WASM file not found at ${wasmPath}`);
        const wasmBuffer = fs.readFileSync(wasmPath);
        const wasmHash = crypto.createHash('sha256').update(wasmBuffer).digest();
        
        console.log(`Uploading ${wasmPath}...`);
        let uploadTx = new TransactionBuilder(account, { fee: '10000000', networkPassphrase })
            .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
            .setTimeout(60).build();
            
        let preparedUpload = await server.prepareTransaction(uploadTx);
        preparedUpload.sign(keypair);
        let uploadRes = await server.sendTransaction(preparedUpload);
        
        if (uploadRes.status !== 'ERROR') {
            await pollTransactionStatus(uploadRes.hash);
        } else {
            throw new Error(`Upload failed ${uploadRes.status}`);
        }

        console.log(`Deploying Contract Instance...`);
        account = await server.getAccount(keypair.publicKey());
        let tx = new TransactionBuilder(account, { fee: '10000000', networkPassphrase })
            .addOperation(Operation.createCustomContract({
                address: new Address(keypair.publicKey()),
                wasmHash: wasmHash
            }))
            .setTimeout(60).build();

        let preparedTx = await server.prepareTransaction(tx);
        preparedTx.sign(keypair);
        let txRes = await server.sendTransaction(preparedTx);

        if (txRes.status === 'ERROR') throw new Error("Deploy failed");
        const status = await pollTransactionStatus(txRes.hash);
        
        let contractId;
        try {
            const addrXdr = status.resultMetaXdr.v3().sorobanMeta().returnValue();
            contractId = Address.fromScVal(addrXdr).toString();
        } catch (e) {
            if (status.returnValue) contractId = Address.fromScVal(status.returnValue).toString();
            else throw new Error("Could not extract Contract ID.");
        }
        return contractId;
    }

    console.log("---- Deploying sXLM Token ----");
    const sxlmId = await deployWasm('./contracts/sxlm-token/target/wasm32-unknown-unknown/release/soroban_sxlm_token.wasm');
    console.log("✅ sXLM Token ID:", sxlmId);

    console.log("---- Deploying Savings Vault ----");
    const vaultId = await deployWasm('./contracts/milestone/target/wasm32-unknown-unknown/release/soroban_savings_vault.wasm');
    console.log("✅ Vault ID:", vaultId);

    console.log("---- Initializing Contacts ----");
    
    // 1. Initialize sXLM token with vaultId as admin
    console.log("Initializing sXLM (Admin = Vault)...");
    let account = await server.getAccount(keypair.publicKey());
    let initSxlmTx = new TransactionBuilder(account, { fee: '10000000', networkPassphrase })
        .addOperation(new Contract(sxlmId).call('initialize', Address.fromString(vaultId).toScVal()))
        .setTimeout(60).build();
    let prepSxlm = await server.prepareTransaction(initSxlmTx);
    prepSxlm.sign(keypair);
    let sxlmRes = await server.sendTransaction(prepSxlm);
    await pollTransactionStatus(sxlmRes.hash);

    // 2. Initialize Vault with native XLM and sXLM id
    console.log("Initializing Vault with XLM and sXLM addresses...");
    const NATIVE_TOKEN = pkg.Asset.native().contractId(networkPassphrase);
    account = await server.getAccount(keypair.publicKey());
    let initVaultTx = new TransactionBuilder(account, { fee: '10000000', networkPassphrase })
        .addOperation(new Contract(vaultId).call('init', 
            Address.fromString(NATIVE_TOKEN).toScVal(), 
            Address.fromString(sxlmId).toScVal())
        )
        .setTimeout(60).build();
    let prepVault = await server.prepareTransaction(initVaultTx);
    prepVault.sign(keypair);
    let vaultRes = await server.sendTransaction(prepVault);
    await pollTransactionStatus(vaultRes.hash);

    console.log("🎉 All initialization successful!");
    return { vaultId, sxlmId, deployer: keypair.secret() };
}
