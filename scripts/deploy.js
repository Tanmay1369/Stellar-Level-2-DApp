import pkg from '@stellar/stellar-sdk';
const { Keypair, Server, Networks, TransactionBuilder, Operation, Asset, Contract } = pkg;
import fs from 'fs';

const server = new Server('https://soroban-testnet.stellar.org');
const networkPassphrase = Networks.TESTNET;

async function fundAccount(publicKey) {
    console.log(`Funding account ${publicKey}...`);
    try {
        await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
    } catch (e) {
        console.log("Friendbot request failed.");
    }
}

async function deploy() {
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

    const wasmHashHex = '244dd1eff19a3235e9d8f528ff4d144e91076aada4cfc917e70a2316c73b3eb0';
    const wasmHashBuffer = Buffer.from(wasmHashHex, 'hex');

    console.log("Deploying Contract from Wasm Hash...");
    let tx = new TransactionBuilder(account, { fee: '100000', networkPassphrase })
        .addOperation(Operation.createCustomContract({
            address: keypair.publicKey(),
            wasmHash: wasmHashBuffer
        }))
        .setTimeout(30)
        .build();

    let preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(keypair);

    console.log("Submitting Create Contract transaction...");
    let txRes = await server.sendTransaction(preparedTx);

    if (txRes.status === 'ERROR') {
        console.error("Deploy failed:", JSON.stringify(txRes, null, 2));
        return;
    }

    console.log("Deploy successful!");
    console.log(txRes.returnValue);
}

deploy().catch(console.error);
