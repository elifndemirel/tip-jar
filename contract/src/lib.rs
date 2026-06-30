#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, String, Vec,
};

// ── Error Types ──────────────────────────────────────────────────────────────
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TipError {
    InvalidAmount = 1,       // Amount is zero or negative
    MessageTooLong = 2,      // Message exceeds 256 characters
    InsufficientBalance = 3, // Sender's balance is insufficient
}

// ── Data Types ───────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub struct TipEntry {
    pub tipper: Address,
    pub amount: i128,    // in stroops (1 XLM = 10_000_000 stroops)
    pub message: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Tips,        // Vec<TipEntry> — full tip history
    Recipient,   // Address — recipient address
    NativeToken, // Address — native XLM SAC address
}

// ── Contract ─────────────────────────────────────────────────────────────────
#[contract]
pub struct TipJar;

#[contractimpl]
impl TipJar {
    // Called once; stores the recipient and the native XLM token address.
    pub fn initialize(env: Env, recipient: Address, native_token: Address) {
        if env.storage().instance().has(&DataKey::Recipient) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::Tips, &Vec::<TipEntry>::new(&env));
        env.storage().instance().extend_ttl(100, 518_400);
    }

    // Transfers XLM from sender to recipient and records the tip.
    pub fn send_tip(
        env: Env,
        tipper: Address,
        amount: i128,
        message: String,
    ) -> Result<(), TipError> {
        // 1. Validation
        if amount <= 0 {
            return Err(TipError::InvalidAmount);
        }
        if message.len() > 256 {
            return Err(TipError::MessageTooLong);
        }

        // 2. Sender must authorize
        tipper.require_auth();

        // 3. Token transfer (tipper → recipient)
        let native_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::NativeToken)
            .unwrap();
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .unwrap();

        let token = TokenClient::new(&env, &native_token);
        token.transfer(&tipper, &recipient, &amount);

        // 4. Record the tip
        let mut tips: Vec<TipEntry> = env
            .storage()
            .instance()
            .get(&DataKey::Tips)
            .unwrap_or(Vec::new(&env));

        tips.push_back(TipEntry {
            tipper: tipper.clone(),
            amount,
            message: message.clone(),
            timestamp: env.ledger().timestamp(),
        });

        env.storage().instance().set(&DataKey::Tips, &tips);

        // 5. Extend TTL
        env.storage().instance().extend_ttl(100, 518_400);

        // 6. Publish event (for frontend polling)
        env.events().publish(
            (soroban_sdk::symbol_short!("tip_sent"),),
            (tipper, amount, message),
        );

        Ok(())
    }

    // Returns the full tip history.
    pub fn get_tips(env: Env) -> Vec<TipEntry> {
        env.storage()
            .instance()
            .get(&DataKey::Tips)
            .unwrap_or(Vec::new(&env))
    }

    // Returns the recipient address.
    pub fn get_recipient(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Recipient)
            .unwrap()
    }

    // Returns the total amount of tips received (in stroops).
    pub fn total_tips(env: Env) -> i128 {
        let tips: Vec<TipEntry> = env
            .storage()
            .instance()
            .get(&DataKey::Tips)
            .unwrap_or(Vec::new(&env));
        let mut total: i128 = 0;
        for tip in tips.iter() {
            total += tip.amount;
        }
        total
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env, String,
    };

    fn setup() -> (Env, Address, Address, TipJarClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TipJar);
        let client = TipJarClient::new(&env, &contract_id);

        let recipient = Address::generate(&env);
        // Using a mock address instead of the real native XLM SAC for testing
        let native_token = Address::generate(&env);

        (env, recipient, native_token, client)
    }

    #[test]
    fn test_initialize() {
        let (_, recipient, native_token, client) = setup();
        client.initialize(&recipient, &native_token);
        assert_eq!(client.get_recipient(), recipient);
        assert_eq!(client.get_tips().len(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize() {
        let (_, recipient, native_token, client) = setup();
        client.initialize(&recipient, &native_token);
        client.initialize(&recipient, &native_token); // expected to panic
    }

    #[test]
    fn test_invalid_amount() {
        let (env, recipient, native_token, client) = setup();
        client.initialize(&recipient, &native_token);
        let tipper = Address::generate(&env);
        let result = client.try_send_tip(
            &tipper,
            &0,
            &String::from_str(&env, "hello"),
        );
        assert_eq!(result, Err(Ok(TipError::InvalidAmount)));
    }

    #[test]
    fn test_message_too_long() {
        let (env, recipient, native_token, client) = setup();
        client.initialize(&recipient, &native_token);
        let tipper = Address::generate(&env);
        // 257-character message
        let long_msg = String::from_str(
            &env,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
             aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
             aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\
             aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        let result = client.try_send_tip(&tipper, &1_000_000, &long_msg);
        assert_eq!(result, Err(Ok(TipError::MessageTooLong)));
    }

    #[test]
    fn test_total_tips() {
        let (env, recipient, native_token, client) = setup();
        // Note: no real token transfer happens in this test (mock env)
        // We are only verifying contract logic here
        client.initialize(&recipient, &native_token);
        assert_eq!(client.total_tips(), 0);
    }
}
