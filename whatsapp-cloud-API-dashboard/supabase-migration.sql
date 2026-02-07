-- =============================================================================
-- WhatsApp Dashboard - Supabase Database Migration
-- =============================================================================
-- This migration sets up all necessary tables for the WhatsApp Cloud API dashboard
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- =============================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. MESSAGES TABLE
-- =============================================================================
-- Stores all WhatsApp messages (inbound and outbound)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Additional fields for WhatsApp Cloud API
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_mime_type TEXT,
  caption TEXT,
  
  -- Tracking fields
  is_read BOOLEAN DEFAULT FALSE,
  is_ai_response BOOLEAN DEFAULT FALSE,
  response_time_ms INTEGER
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_phone_number ON messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_messages_phone_timestamp ON messages(phone_number, timestamp DESC);

-- =============================================================================
-- 2. CONVERSATIONS TABLE
-- =============================================================================
-- Stores conversation metadata and state
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT UNIQUE NOT NULL,
  last_message_at TIMESTAMPTZ,
  last_human_response_at TIMESTAMPTZ,
  last_ai_response_at TIMESTAMPTZ,
  human_active BOOLEAN DEFAULT FALSE,
  total_messages INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Customer information (optional)
  customer_name TEXT,
  customer_email TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_phone_number ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_human_active ON conversations(human_active);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- =============================================================================
-- 3. WEBHOOK_LOGS TABLE
-- =============================================================================
-- Logs all webhook events from WhatsApp Cloud API for debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);

-- =============================================================================
-- 4. FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for messages table
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for conversations table
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Function to update conversation metadata when new message arrives
-- =============================================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update conversation record
  INSERT INTO conversations (
    phone_number,
    last_message_at,
    last_human_response_at,
    last_ai_response_at,
    human_active,
    total_messages,
    unread_count
  ) VALUES (
    NEW.phone_number,
    NEW.timestamp,
    CASE WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = FALSE THEN NEW.timestamp ELSE NULL END,
    CASE WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = TRUE THEN NEW.timestamp ELSE NULL END,
    CASE WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = FALSE THEN TRUE ELSE FALSE END,
    1,
    CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END
  )
  ON CONFLICT (phone_number) DO UPDATE SET
    last_message_at = NEW.timestamp,
    last_human_response_at = CASE 
      WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = FALSE 
      THEN NEW.timestamp 
      ELSE conversations.last_human_response_at 
    END,
    last_ai_response_at = CASE 
      WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = TRUE 
      THEN NEW.timestamp 
      ELSE conversations.last_ai_response_at 
    END,
    human_active = CASE 
      WHEN NEW.direction = 'outbound' AND NEW.is_ai_response = FALSE 
      THEN TRUE 
      ELSE conversations.human_active 
    END,
    total_messages = conversations.total_messages + 1,
    unread_count = CASE 
      WHEN NEW.direction = 'inbound' 
      THEN conversations.unread_count + 1 
      ELSE conversations.unread_count 
    END,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation on new message
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
CREATE TRIGGER trigger_update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- =============================================================================
-- Function to check if human is active (for n8n integration)
-- =============================================================================
CREATE OR REPLACE FUNCTION check_human_active(
  p_phone_number TEXT,
  p_hours_threshold INTEGER DEFAULT 2
)
RETURNS TABLE (
  phone_number TEXT,
  human_active BOOLEAN,
  last_human_response_time TIMESTAMPTZ,
  hours_remaining NUMERIC,
  message TEXT
) AS $$
DECLARE
  v_last_human_response TIMESTAMPTZ;
  v_hours_elapsed NUMERIC;
  v_hours_remaining NUMERIC;
  v_human_active BOOLEAN;
BEGIN
  -- Get the last human response time
  SELECT MAX(timestamp) INTO v_last_human_response
  FROM messages
  WHERE messages.phone_number = p_phone_number
    AND direction = 'outbound'
    AND is_ai_response = FALSE
    AND timestamp >= NOW() - (p_hours_threshold || ' hours')::INTERVAL;
  
  -- Calculate if human is still active
  IF v_last_human_response IS NOT NULL THEN
    v_hours_elapsed := EXTRACT(EPOCH FROM (NOW() - v_last_human_response)) / 3600;
    v_hours_remaining := GREATEST(0, p_hours_threshold - v_hours_elapsed);
    v_human_active := v_hours_remaining > 0;
  ELSE
    v_hours_elapsed := NULL;
    v_hours_remaining := 0;
    v_human_active := FALSE;
  END IF;
  
  -- Return result
  RETURN QUERY SELECT
    p_phone_number,
    v_human_active,
    v_last_human_response,
    ROUND(v_hours_remaining::NUMERIC, 2),
    CASE 
      WHEN v_human_active THEN 
        'Human is active - AI should wait ' || ROUND(v_hours_remaining::NUMERIC, 1) || ' more hours'
      ELSE 
        'No human activity detected - AI can respond'
    END;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
-- Enable RLS on all tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all messages
CREATE POLICY "Allow authenticated users to read messages"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert messages
CREATE POLICY "Allow authenticated users to insert messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update messages
CREATE POLICY "Allow authenticated users to update messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Allow service role full access to messages
CREATE POLICY "Allow service role full access to messages"
  ON messages
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow authenticated users to read conversations
CREATE POLICY "Allow authenticated users to read conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role full access to conversations
CREATE POLICY "Allow service role full access to conversations"
  ON conversations
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow service role full access to webhook_logs
CREATE POLICY "Allow service role full access to webhook_logs"
  ON webhook_logs
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 6. SAMPLE DATA (OPTIONAL - COMMENT OUT IN PRODUCTION)
-- =============================================================================
-- Uncomment below to insert sample data for testing

/*
INSERT INTO messages (message_id, phone_number, from_number, to_number, body, direction, status, timestamp, is_ai_response)
VALUES 
  ('msg_001', '+254768322488', '+254768322488', '+1234567890', 'Hello, I need help', 'inbound', 'delivered', NOW() - INTERVAL '1 hour', FALSE),
  ('msg_002', '+254768322488', '+1234567890', '+254768322488', 'Hi! How can I assist you today?', 'outbound', 'delivered', NOW() - INTERVAL '59 minutes', TRUE),
  ('msg_003', '+254768322488', '+254768322488', '+1234567890', 'I want to check my order status', 'inbound', 'delivered', NOW() - INTERVAL '30 minutes', FALSE);
*/

-- =============================================================================
-- 7. HELPFUL QUERIES
-- =============================================================================

-- Query to get all conversations with last message
-- SELECT 
--   c.phone_number,
--   c.last_message_at,
--   c.human_active,
--   c.total_messages,
--   c.unread_count,
--   m.body as last_message_body,
--   m.direction as last_message_direction
-- FROM conversations c
-- LEFT JOIN LATERAL (
--   SELECT body, direction
--   FROM messages
--   WHERE phone_number = c.phone_number
--   ORDER BY timestamp DESC
--   LIMIT 1
-- ) m ON true
-- ORDER BY c.last_message_at DESC;

-- Query to check human activity for a specific phone number
-- SELECT * FROM check_human_active('+254768322488', 2);

-- Query to get message statistics
-- SELECT 
--   COUNT(*) as total_messages,
--   COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_messages,
--   COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_messages,
--   COUNT(*) FILTER (WHERE is_ai_response = TRUE) as ai_responses,
--   COUNT(*) FILTER (WHERE is_ai_response = FALSE AND direction = 'outbound') as human_responses
-- FROM messages;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Next steps:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Verify all tables were created successfully
-- 3. Update your .env.local with Supabase credentials
-- 4. Test the API endpoints
-- =============================================================================
