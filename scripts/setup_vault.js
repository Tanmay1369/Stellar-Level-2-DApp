import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { deploy } from './deploy.js';

async function main() {
  try {
    console.log('🚀 Starting Full Automation: Build -> Deploy -> Update Frontend');

    // 1. Build the contract
    console.log('\n📦 Step 1: Building Soroban Contract...');
    execSync('cargo build --target wasm32-unknown-unknown --release', {
      cwd: path.join(process.cwd(), 'contracts/milestone'),
      stdio: 'inherit'
    });
    console.log('✅ Build successful!');

    // 2. Deploy & Initialize on Testnet
    console.log('\n🌐 Step 2: Deploying & Initializing on Stellar Testnet...');
    const contractId = await deploy();
    if (!contractId) throw new Error('Deployment failed to return a Contract ID');
    
    // 3. Update Frontend (stellar.ts)
    console.log('\nweb Step 3: Updating Frontend Configuration...');
    const stellarLibPath = path.join(process.cwd(), 'src/lib/stellar.ts');
    let content = fs.readFileSync(stellarLibPath, 'utf8');
    
    const regex = /export const VAULT_CONTRACT_ID = '.*';/;
    if (!regex.test(content)) {
      throw new Error('Could not find VAULT_CONTRACT_ID definition in src/lib/stellar.ts');
    }
    
    content = content.replace(regex, `export const VAULT_CONTRACT_ID = '${contractId}';`);
    fs.writeFileSync(stellarLibPath, content);
    console.log('✅ src/lib/stellar.ts updated successfully!');

    console.log('\n🎉 ALL DONE! Your dApp is now built, deployed, and synced.');
    console.log('👉 Refresh your browser and connect your wallet to start saving!');

  } catch (error) {
    console.error('\n❌ Automation failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main();
