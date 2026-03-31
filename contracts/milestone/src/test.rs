#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env};

fn setup_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let token_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let sxlm_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
    (env, admin, owner, token_addr, sxlm_addr)
}

#[test]
fn test_create_vault() {
    let (env, _admin, owner, token_addr, sxlm_addr) = setup_env();
    let contract_id = env.register(SavingsVaultContract, ());
    let client = SavingsVaultContractClient::new(&env, &contract_id);

    client.init(&token_addr, &sxlm_addr);

    let id = client.create_vault(&owner, &1000i128, &0u64);
    assert_eq!(id, 1);

    let vault = client.get_vault(&1);
    assert_eq!(vault.goal, 1000);
    assert_eq!(vault.balance, 0);
    assert_eq!(vault.withdrawn, false);
}

#[test]
fn test_deposit_increases_balance() {
    let (env, admin, owner, token_addr, sxlm_addr) = setup_env();
    let contract_id = env.register(SavingsVaultContract, ());
    let client = SavingsVaultContractClient::new(&env, &contract_id);

    let stellar_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
    stellar_client.mint(&owner, &5000);

    client.init(&token_addr, &sxlm_addr);
    let id = client.create_vault(&owner, &1000i128, &0u64);
    client.deposit(&owner, &id, &500i128);

    let vault = client.get_vault(&id);
    assert_eq!(vault.balance, 500);

    let token_client = soroban_sdk::token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&contract_id), 500);
}

#[test]
fn test_withdraw_when_goal_met() {
    let (env, _admin, owner, token_addr, sxlm_addr) = setup_env();
    let contract_id = env.register(SavingsVaultContract, ());
    let client = SavingsVaultContractClient::new(&env, &contract_id);

    let stellar_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
    stellar_client.mint(&owner, &5000);

    client.init(&token_addr, &sxlm_addr);
    let id = client.create_vault(&owner, &1000i128, &0u64);
    client.deposit(&owner, &id, &1000i128);
    client.withdraw(&id);

    let vault = client.get_vault(&id);
    assert_eq!(vault.withdrawn, true);

    let token_client = soroban_sdk::token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&owner), 5000); // got everything back
}

#[test]
fn test_withdraw_when_time_expired() {
    let (env, _admin, owner, token_addr, sxlm_addr) = setup_env();
    let contract_id = env.register(SavingsVaultContract, ());
    let client = SavingsVaultContractClient::new(&env, &contract_id);

    let stellar_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
    stellar_client.mint(&owner, &5000);

    client.init(&token_addr, &sxlm_addr);

    // Lock until timestamp 100, but we'll advance time past that
    let id = client.create_vault(&owner, &9999i128, &100u64);
    client.deposit(&owner, &id, &500i128);

    // Advance ledger time beyond unlock_time
    env.ledger().with_mut(|l| {
        l.timestamp = 200;
    });

    // Should succeed because time lock has expired even though goal (9999) not met
    client.withdraw(&id);

    let vault = client.get_vault(&id);
    assert_eq!(vault.withdrawn, true);
}

#[test]
#[should_panic(expected = "ERR_GOAL_NOT_MET")]
fn test_withdraw_fails_too_early() {
    let (env, _admin, owner, token_addr, sxlm_addr) = setup_env();
    let contract_id = env.register(SavingsVaultContract, ());
    let client = SavingsVaultContractClient::new(&env, &contract_id);

    let stellar_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_addr);
    stellar_client.mint(&owner, &5000);

    client.init(&token_addr, &sxlm_addr);
    // Goal is 9999 and unlock_time is far in the future
    let id = client.create_vault(&owner, &9999i128, &999999999u64);
    client.deposit(&owner, &id, &500i128);

    // This should panic: goal not met, time not expired
    client.withdraw(&id);
}
