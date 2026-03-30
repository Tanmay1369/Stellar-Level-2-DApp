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
    // Initialize with native XLM token address
    pub fn init(env: Env, token: Address) {
        if env.storage().instance().has(&symbol_short!("token")) {
            panic!("ERR_ALREADY_INIT");
        }
        env.storage().instance().set(&symbol_short!("token"), &token);
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

        vault.balance += amount;
        env.storage().persistent().set(&vault_id, &vault);
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

        vault.withdrawn = true;
        env.storage().persistent().set(&vault_id, &vault);
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
