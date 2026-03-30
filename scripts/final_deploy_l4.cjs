const { rpc, TransactionBuilder, Keypair, Networks, Address, Contract, xdr, Operation } = require('@stellar/stellar-sdk');
const fs = require('fs');
const https = require('https');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);
const networkPassphrase = Networks.TESTNET;

async function fundAccount(publicKey) {
    console.log(`Funding account ${publicKey}...`);
    return new Promise((resolve, reject) => {
        https.get(`https://friendbot.stellar.org?addr=${publicKey}`, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        }).on('error', reject);
    });
}

async function poll(hash) {
    let status = await server.getTransaction(hash);
    while (status.status === 'NOT_FOUND' || status.status === 'PENDING') {
        await new Promise(r => setTimeout(r, 2000));
        status = await server.getTransaction(hash);
    }
    return status;
}

async function deploy() {
    const keypair = Keypair.random();
    console.log(`Deployer: ${keypair.publicKey()}`);
    await fundAccount(keypair.publicKey());
    await new Promise(r => setTimeout(r, 5000));

    let account = await server.getAccount(keypair.publicKey());

    // 1. Upload Reward Token WASM
    console.log("Uploading Reward Token WASM...");
    const tokenWasm = fs.readFileSync('contracts/reward_token/target/wasm32-unknown-unknown/release/soroban_reward_token_contract.wasm');
    let uploadTx = new TransactionBuilder(account, { fee: '10000000', networkPassphrase })
        .addOperation(Operation.uploadContractWasm({ wasm: tokenWasm }))
        .setTimeout(30)
        .build();
    let prep = await server.prepareTransaction(uploadTx);
    prep.sign(keypair);
    let res = await server.sendTransaction(prep);
    const pollRes = await poll(res.hash);
    console.log("Full Poll Response (Upload):", JSON.stringify(pollRes, null, 2));
    
    // Wasm hash is in results[0] for simple upload
    const tokenWasmHash = pollRes.resultMetaXdr; // Need to parse XDR or use Helper
    // For now, I'll extract it assuming standard position
}

deploy().catch(console.error);
