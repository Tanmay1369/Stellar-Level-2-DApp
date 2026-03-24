#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    YesCount,
    NoCount,
    Voted(Address),
}

#[contract]
pub struct PollContract;

#[contractimpl]
impl PollContract {
    /// Get the current vote counts for Yes and No.
    pub fn get_votes(env: Env) -> (u32, u32) {
        let yes: u32 = env.storage().instance().get(&DataKey::YesCount).unwrap_or(0);
        let no: u32 = env.storage().instance().get(&DataKey::NoCount).unwrap_or(0);
        (yes, no)
    }

    /// Cast a vote. `vote_yes` being true means Yes, false means No.
    pub fn vote(env: Env, voter: Address, vote_yes: bool) {
        voter.require_auth();

        let voted_key = DataKey::Voted(voter.clone());
        if env.storage().instance().has(&voted_key) {
            panic!("User has already voted");
        }

        if vote_yes {
            let mut yes: u32 = env.storage().instance().get(&DataKey::YesCount).unwrap_or(0);
            yes += 1;
            env.storage().instance().set(&DataKey::YesCount, &yes);
        } else {
            let mut no: u32 = env.storage().instance().get(&DataKey::NoCount).unwrap_or(0);
            no += 1;
            env.storage().instance().set(&DataKey::NoCount, &no);
        }

        env.storage().instance().set(&voted_key, &true);

        // Publish event for real-time tracking
        let vote_sym = if vote_yes { symbol_short!("Yes") } else { symbol_short!("No") };
        env.events().publish((symbol_short!("Voted"), voter), vote_sym);
    }
}
