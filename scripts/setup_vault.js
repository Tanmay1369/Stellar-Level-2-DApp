import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { deploy } from './deploy.js';

async function main() {
  try {
    console.log('🚀 Starting Full Automation: Build -> Deploy -> Update Frontend');

    // 1. Build the contracts
    console.log('\n📦 Step 1: Building sXLM Token Contract...');
    execSync('cargo build --target wasm32-unknown-unknown --release', {
      cwd: path.join(process.cwd(), 'contracts/sxlm-token'),
      stdio: 'inherit'
    });

    console.log('\n📦 Step 1b: Building Vault Contract...');
    execSync('cargo build --target wasm32-unknown-unknown --release', {
      cwd: path.join(process.cwd(), 'contracts/milestone'),
      stdio: 'inherit'
    });
    console.log('✅ Builds successful!');

    // 2. Deploy & Initialize on Testnet
    console.log('\n🌐 Step 2: Deploying & Initializing on Stellar Testnet...');
    const result = await deploy();
    if (!result || !result.vaultId) throw new Error('Deployment failed to return Contract IDs');
    
    // 3. Update Frontend (stellar.ts)
    console.log('\n🖥️ Step 3: Updating Frontend Configuration...');
    const stellarLibPath = path.join(process.cwd(), 'src/lib/stellar.ts');
    let content = fs.readFileSync(stellarLibPath, 'utf8');
    
    const regex = /export const VAULT_CONTRACT_ID = '.*';/;
    if (!regex.test(content)) {
      throw new Error('Could not find VAULT_CONTRACT_ID definition in src/lib/stellar.ts');
    }
    
    content = content.replace(regex, `export const VAULT_CONTRACT_ID = '${result.vaultId}';`);
    fs.writeFileSync(stellarLibPath, content);
    console.log('✅ src/lib/stellar.ts updated successfully with Vault ID:', result.vaultId);

    console.log('\n🎉 ALL DONE! Your Level 4 dApp is now built, deployed, and synced.');
    console.log(`Vault ID: ${result.vaultId}`);
    console.log(`sXLM Token ID: ${result.sxlmId}`);
    console.log('👉 Refresh your browser and connect your wallet to start saving!');

  } catch (error) {
    console.error('\n❌ Automation failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main();
