-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idrx_id VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),
    fullname VARCHAR(255) NOT NULL,
    id_file VARCHAR(255),
    api_key VARCHAR(255),
    secret_key VARCHAR(255),
    google_id VARCHAR(255),
    is_google_auth BOOLEAN DEFAULT false,
    is_wallet_only BOOLEAN DEFAULT false,
    
    -- Bank Account Info
    bank_id VARCHAR(255),
    hash_bank_account_number VARCHAR(255),
    bank_account_number VARCHAR(255),
    bank_account_name VARCHAR(255),
    bank_code INTEGER,
    bank_name VARCHAR(255),
    deposit_wallet_address VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wallet Addresses Table (One-to-Many relationship)
CREATE TABLE IF NOT EXISTS wallet_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    role VARCHAR(20) DEFAULT 'none' CHECK (role IN ('none', 'sender', 'receiver')),
    available_balance DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registered Bank Accounts Table
CREATE TABLE IF NOT EXISTS registered_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bank_account_number VARCHAR(255) NOT NULL,
    bank_account_name VARCHAR(255) NOT NULL,
    bank_code INTEGER NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    hash_bank_account_number VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vaults Table
CREATE TABLE IF NOT EXISTS vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id VARCHAR(255) UNIQUE NOT NULL,
    crowdfunder_id UUID REFERENCES users(id) ON DELETE CASCADE,
    crowdfunder_email VARCHAR(255) NOT NULL,
    crowdfunder_wallet_address VARCHAR(42),
    
    -- Vault Information
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target_amount DECIMAL(20,2) NOT NULL,
    current_amount DECIMAL(20,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USDC', 'USDT', 'IDRX')),
    
    -- IDRX Integration
    idrx_api_key VARCHAR(255),
    idrx_secret_key VARCHAR(255),
    deposit_wallet_address VARCHAR(42),
    
    -- Bank Account
    bank_account_number VARCHAR(255),
    bank_account_name VARCHAR(255),
    bank_code INTEGER,
    bank_name VARCHAR(255),
    
    -- Status & Timing
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contributors Table
CREATE TABLE IF NOT EXISTS contributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id VARCHAR(255) REFERENCES vaults(vault_id) ON DELETE CASCADE,
    contributor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    contributor_email VARCHAR(255),
    contributor_wallet_address VARCHAR(42),
    amount DECIMAL(20,8) NOT NULL,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('IDR', 'USDC', 'USDT', 'IDRX')),
    payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('QRIS', 'CRYPTO', 'IDRX')),
    transaction_hash VARCHAR(66),
    qris_transaction_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Login Session Tokens Table
CREATE TABLE IF NOT EXISTS login_session_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    email VARCHAR(255),
    wallet_address VARCHAR(42),
    role VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_idrx_id ON users(idrx_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_user_id ON wallet_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_address ON wallet_addresses(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vaults_vault_id ON vaults(vault_id);
CREATE INDEX IF NOT EXISTS idx_vaults_crowdfunder_id ON vaults(crowdfunder_id);
CREATE INDEX IF NOT EXISTS idx_vaults_status ON vaults(status);
CREATE INDEX IF NOT EXISTS idx_contributors_vault_id ON contributors(vault_id);
CREATE INDEX IF NOT EXISTS idx_contributors_contributor_id ON contributors(contributor_id);
CREATE INDEX IF NOT EXISTS idx_login_session_tokens_user_id ON login_session_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_session_tokens_token ON login_session_tokens(token);

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_vaults_updated_at BEFORE UPDATE ON vaults 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
