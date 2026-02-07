import { NextRequest, NextResponse } from 'next/server';
import { getMessages } from '@/lib/whatsapp';

export async function GET() {
  try {
    console.log('Fetching messages from database...');
    
    // Fetch all messages from Supabase
    const messages = await getMessages();

    // Transform to match the format expected by the frontend
    const formattedMessages = messages.map((msg: any) => ({
      sid: msg.message_id,
      from: msg.direction === 'inbound' ? msg.from_number : msg.to_number,
      to: msg.direction === 'inbound' ? msg.to_number : msg.from_number,
      body: msg.body || '',
      date_sent: msg.timestamp,
      status: msg.status || 'delivered',
      direction: msg.direction === 'inbound' ? 'inbound' : 'outbound-api',
      message_type: msg.message_type,
      is_ai_response: msg.is_ai_response
    }));

    console.log(`Fetched ${formattedMessages.length} messages`);
    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
