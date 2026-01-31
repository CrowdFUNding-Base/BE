-- Gamification columns for wallet_addresses table
-- Run this in Supabase SQL Editor

-- Add charity points (earned per donation)
ALTER TABLE wallet_addresses 
ADD COLUMN IF NOT EXISTS charity_points INTEGER DEFAULT 0;

-- Add streak (consecutive donation days)
ALTER TABLE wallet_addresses 
ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;

-- Add last donation date (for streak calculation)
ALTER TABLE wallet_addresses 
ADD COLUMN IF NOT EXISTS last_donation_date DATE;

-- Add total donated amount
ALTER TABLE wallet_addresses 
ADD COLUMN IF NOT EXISTS total_donated DECIMAL(20,8) DEFAULT 0;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_wallet_addresses_charity_points 
ON wallet_addresses(charity_points DESC);
