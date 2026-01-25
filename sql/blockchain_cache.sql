-- =====================================================
-- BLOCKCHAIN CACHE TABLES
-- Data dari blockchain yang di-sync oleh Ponder
-- =====================================================

-- Blockchain Campaigns (cached from Ponder)
CREATE TABLE IF NOT EXISTS blockchain_campaigns (
  id INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  creator_name VARCHAR(255),
  owner VARCHAR(42) NOT NULL,
  balance NUMERIC(30, 0) DEFAULT 0,
  target_amount NUMERIC(30, 0) NOT NULL,
  creation_time BIGINT NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blockchain Donations (cached from Ponder)
CREATE TABLE IF NOT EXISTS blockchain_donations (
  id VARCHAR(255) PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES blockchain_campaigns(id),
  donor VARCHAR(42) NOT NULL,
  amount NUMERIC(30, 0) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blockchain Withdrawals (cached from Ponder)
CREATE TABLE IF NOT EXISTS blockchain_withdrawals (
  id VARCHAR(255) PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES blockchain_campaigns(id),
  name VARCHAR(255),
  owner VARCHAR(42) NOT NULL,
  creator_name VARCHAR(255),
  amount NUMERIC(30, 0) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blockchain Badges (cached from Ponder)
CREATE TABLE IF NOT EXISTS blockchain_badges (
  token_id INTEGER PRIMARY KEY,
  owner VARCHAR(42) NOT NULL,
  name VARCHAR(255) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES for fast queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_bc_campaigns_owner ON blockchain_campaigns(owner);
CREATE INDEX IF NOT EXISTS idx_bc_campaigns_creation ON blockchain_campaigns(creation_time DESC);

CREATE INDEX IF NOT EXISTS idx_bc_donations_campaign ON blockchain_donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bc_donations_donor ON blockchain_donations(donor);
CREATE INDEX IF NOT EXISTS idx_bc_donations_timestamp ON blockchain_donations(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_bc_withdrawals_campaign ON blockchain_withdrawals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bc_withdrawals_owner ON blockchain_withdrawals(owner);

CREATE INDEX IF NOT EXISTS idx_bc_badges_owner ON blockchain_badges(owner);

-- =====================================================
-- SYNC STATUS TABLE (untuk tracking sync health)
-- =====================================================

CREATE TABLE IF NOT EXISTS sync_status (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL, -- 'campaign', 'donation', 'withdrawal', 'badge'
  last_block_number BIGINT DEFAULT 0,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_synced INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'healthy', -- 'healthy', 'lagging', 'error'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sync status records
INSERT INTO sync_status (entity_type, status) VALUES 
  ('campaign', 'healthy'),
  ('donation', 'healthy'),
  ('withdrawal', 'healthy'),
  ('badge', 'healthy')
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTION: Update timestamp on update
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_blockchain_campaigns_updated_at ON blockchain_campaigns;
CREATE TRIGGER update_blockchain_campaigns_updated_at
    BEFORE UPDATE ON blockchain_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_status_updated_at ON sync_status;
CREATE TRIGGER update_sync_status_updated_at
    BEFORE UPDATE ON sync_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
