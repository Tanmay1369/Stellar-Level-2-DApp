#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env};

#[contract]
pub struct SxlmToken;

#[contractimpl]
impl SxlmToken {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("admin")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("admin"), &admin);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&symbol_short!("admin")).unwrap();
        admin.require_auth();
        
        let mut balance: i128 = env.storage().persistent().get(&to).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&to, &balance);
        env.events().publish((symbol_short!("mint"), to.clone()), amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&symbol_short!("admin")).unwrap();
        admin.require_auth();

        let mut balance: i128 = env.storage().persistent().get(&from).unwrap_or(0);
        if balance < amount {
            panic!("insufficient balance");
        }
        balance -= amount;
        env.storage().persistent().set(&from, &balance);
        env.events().publish((symbol_short!("burn"), from.clone()), amount);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&id).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_mint_burn() {
        let env = Env::default();
        let contract_id = env.register(SxlmToken, ());
        let client = SxlmTokenClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let user = Address::generate(&env);

        client.initialize(&admin);
        
        env.mock_all_auths();
        client.mint(&user, &100);
        assert_eq!(client.balance(&user), 100);

        client.burn(&user, &50);
        assert_eq!(client.balance(&user), 50);
    }
}
