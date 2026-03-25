import pkg from '@stellar/stellar-sdk';
const { rpc, TransactionBuilder, Networks, Contract, Keypair } = pkg;

const server = new rpc.Server('https://soroban-testnet.stellar.org');
const CONTRACT_ID = 'CDRZCJDK7G5U4PBKLTPQL4ENKLPHHJJ4A75G6OFPKBPFPHIDRP73GDUC';

async function check() {
    console.log("Checking contract:", CONTRACT_ID);
    const contract = new Contract(CONTRACT_ID);
    const dummyAccount = Keypair.random().publicKey();

    // Create a mock account object for the transaction builder
    const mockAccount = {
        accountId: () => dummyAccount,
        sequenceNumber: () => "0",
        incrementSequenceNumber: () => { }
    };

    let tx = new TransactionBuilder(mockAccount, { fee: '100', networkPassphrase: Networks.TESTNET })
        .addOperation(contract.call('get_votes'))
        .setTimeout(30)
        .build();

    console.log("Simulating transaction...");
    const simRes = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(simRes) && simRes.result && simRes.result.retval) {
        console.log("Simulation Success!");
        const val = simRes.result.retval;
        // val is ScVal
        // Let's try to inspect it
        console.log("Raw ScVal type:", val._arm);
        const value = val.value();
        if (Array.isArray(value)) {
            console.log("Tuple items:", value.length);
            value.forEach((v, i) => {
                console.log(`Item ${i}:`, v.u32 ? v.u32() : v.value());
            });
        } else {
            console.log("Value is not an array:", value);
        }
    } else {
        console.log("Simulation failed.");
        console.log(JSON.stringify(simRes, null, 2));
    }
}

check().catch(console.error);
