-- Achievements Table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    campaign_id VARCHAR(255),
    
    -- Achievement Info
    title VARCHAR(255) NOT NULL,
    description TEXT,
    badge_type VARCHAR(50) NOT NULL, -- 'first_donation', 'milestone', 'top_donor', 'campaign_creator', etc.
    
    -- NFT Minting
    is_minted BOOLEAN DEFAULT false,
    token_id INTEGER,
    mint_transaction_hash VARCHAR(66),
    minted_at TIMESTAMP,
    
    -- Metadata
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Share Links Table
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id VARCHAR(255) NOT NULL,
    short_code VARCHAR(10) UNIQUE NOT NULL,
    created_by UUID REFERENCES users(id),
    clicks INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_campaign_id ON achievements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_achievements_is_minted ON achievements(is_minted);
CREATE INDEX IF NOT EXISTS idx_achievements_badge_type ON achievements(badge_type);
CREATE INDEX IF NOT EXISTS idx_share_links_short_code ON share_links(short_code);
CREATE INDEX IF NOT EXISTS idx_share_links_campaign_id ON share_links(campaign_id);

-- Update trigger for achievements
CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
