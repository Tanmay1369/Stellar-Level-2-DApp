#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, token};

#[contracttype]
#[derive(Clone)]
pub struct Vault {
    pub id: u32,
    pub owner: Address,
    pub goal: i128,       // Target savings goal
    pub balance: i128,    // Current deposited amount
    pub unlock_time: u64, // Unix timestamp
    pub withdrawn: bool,
}

#[contract]
pub struct SavingsVaultContract;

#[contractimpl]
impl SavingsVaultContract {
    // Initialize with native XLM token address and the sXLM custom token address
    pub fn init(env: Env, token: Address, sxlm_token: Address) {
        if env.storage().instance().has(&symbol_short!("token")) {
            panic!("ERR_ALREADY_INIT");
        }
        env.storage().instance().set(&symbol_short!("token"), &token);
        env.storage().instance().set(&symbol_short!("sxlm"), &sxlm_token);
    }

    // Create a new savings vault
    pub fn create_vault(env: Env, owner: Address, goal: i128, unlock_time: u64) -> u32 {
        owner.require_auth();
        let mut count: u32 = env.storage().instance().get(&symbol_short!("count")).unwrap_or(0);
        count += 1;

        let vault = Vault {
            id: count,
            owner: owner.clone(),
            goal,
            balance: 0,
            unlock_time,
            withdrawn: false,
        };

        env.storage().persistent().set(&count, &vault);
        env.storage().instance().set(&symbol_short!("count"), &count);

        env.events().publish((soroban_sdk::Symbol::new(&env, "VaultCreated"), count), owner);

        count
    }

    // Deposit XLM into a vault
    pub fn deposit(env: Env, from: Address, vault_id: u32, amount: i128) {
        from.require_auth();

        let mut vault: Vault = env.storage().persistent().get(&vault_id).expect("ERR_NO_VAULT");
        if vault.withdrawn {
            panic!("ERR_VAULT_CLOSED");
        }
        if amount == 0 {
            panic!("ERR_ZERO_AMOUNT");
        }

        let token_addr: Address = env.storage().instance()
            .get(&symbol_short!("token"))
            .expect("ERR_NO_TOKEN_INIT");
        let client = token::Client::new(&env, &token_addr);

        // Transfer XLM from depositor to this contract
        client.transfer(&from, &env.current_contract_address(), &amount);

        // Mint sXLM to user via cross-contract call
        let sxlm_addr: Address = env.storage().instance()
            .get(&symbol_short!("sxlm"))
            .expect("ERR_NO_SXL_INIT");
        use soroban_sdk::{vec, IntoVal};
        env.invoke_contract::<()>(&sxlm_addr, &symbol_short!("mint"), vec![&env, from.into_val(&env), amount.into_val(&env)]);

        vault.balance += amount;
        env.storage().persistent().set(&vault_id, &vault);

        env.events().publish((symbol_short!("Deposit"), vault_id), amount);
    }

    // Withdraw funds — allowed if goal is met OR time lock has expired
    pub fn withdraw(env: Env, vault_id: u32) {
        let mut vault: Vault = env.storage().persistent().get(&vault_id).expect("ERR_NO_VAULT");
        vault.owner.require_auth();

        if vault.withdrawn {
            panic!("ERR_VAULT_WITHDRAWN");
        }

        let now = env.ledger().timestamp();
        let goal_met = vault.balance >= vault.goal;
        let time_expired = unlock_time_passed(now, vault.unlock_time);

        if !goal_met && !time_expired {
            panic!("ERR_GOAL_NOT_MET");
        }

        let token_addr: Address = env.storage().instance()
            .get(&symbol_short!("token"))
            .expect("ERR_NO_TOKEN_INIT");
        let client = token::Client::new(&env, &token_addr);

        // Transfer all funds back to owner
        client.transfer(&env.current_contract_address(), &vault.owner, &vault.balance);

        // Burn sXLM from user via cross-contract call
        let sxlm_addr: Address = env.storage().instance()
            .get(&symbol_short!("sxlm"))
            .expect("ERR_NO_SXL_INIT");
        use soroban_sdk::{vec, IntoVal};
        env.invoke_contract::<()>(&sxlm_addr, &symbol_short!("burn"), vec![&env, vault.owner.into_val(&env), vault.balance.into_val(&env)]);

        vault.withdrawn = true;
        env.storage().persistent().set(&vault_id, &vault);

        env.events().publish((symbol_short!("Withdraw"), vault_id), vault.balance);
    }

    // Read vault data
    pub fn get_vault(env: Env, vault_id: u32) -> Vault {
        env.storage().persistent().get(&vault_id).expect("ERR_NO_VAULT")
    }
}

fn unlock_time_passed(now: u64, unlock_time: u64) -> bool {
    // unlock_time of 0 means no time lock
    unlock_time > 0 && now >= unlock_time
}

mod test;
