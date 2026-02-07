import { createClient } from '@supabase/supabase-js';

console.log('Environment variables check:');
console.log('NEXT_PUBLIC_SUPABASE_URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export interface WhatsAppMessage {
  id: string;
  message_id: string;
  phone_number: string;
  from_number: string;
  to_number: string;
  body: string | null;
  direction: 'inbound' | 'outbound';
  status: string | null;
  timestamp: string;
  created_at: string;
  updated_at: string;
  metadata: any;
  message_type: string;
  media_url: string | null;
  media_mime_type: string | null;
  caption: string | null;
  is_read: boolean;
  is_ai_response: boolean;
  response_time_ms: number | null;
}

export async function sendWhatsAppMessage(to: string, body: string, isAiResponse: boolean = false) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp credentials not configured');
  }

  // Clean phone number (remove + and any spaces)
  const cleanTo = to.replace(/\+/g, '').replace(/\s/g, '');

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: body
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('WhatsApp API error:', data);
    throw new Error(data.error?.message || 'Failed to send message');
  }

  // Store the sent message in database
  const messageId = data.messages?.[0]?.id || `msg_${Date.now()}`;
  const fromNumber = phoneNumberId;

  await supabaseAdmin.from('messages').insert({
    message_id: messageId,
    phone_number: cleanTo,
    from_number: fromNumber,
    to_number: cleanTo,
    body: body,
    direction: 'outbound',
    status: 'sent',
    timestamp: new Date().toISOString(),
    message_type: 'text',
    is_ai_response: isAiResponse,
    metadata: data
  });

  return data;
}

export async function getMessages(phoneNumber?: string, limit: number = 1000) {
  console.log('getMessages called with:', { phoneNumber, limit });
  console.log('Supabase client initialized:', !!supabaseAdmin);
  
  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\+/g, '').replace(/\s/g, '');
    query = query.eq('phone_number', cleanPhone);
  }

  console.log('Executing query...');
  const { data, error } = await query;

  if (error) {
    console.error('Error fetching messages:', error);
    throw new Error('Failed to fetch messages from database');
  }

  console.log('Query result:', { data: data?.length || 0, error: null });
  return data || [];
}

export async function storeInboundMessage(webhookData: any) {
  const message = webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const metadata = webhookData.entry?.[0]?.changes?.[0]?.value?.metadata;

  if (!message) {
    return null;
  }

  const messageId = message.id;
  const from = message.from;
  const timestamp = new Date(parseInt(message.timestamp) * 1000).toISOString();
  
  let body = '';
  let messageType = message.type;
  let mediaUrl = null;
  let mediaMimeType = null;
  let caption = null;

  // Extract message content based on type
  switch (message.type) {
    case 'text':
      body = message.text?.body || '';
      break;
    case 'image':
      mediaUrl = message.image?.id;
      mediaMimeType = message.image?.mime_type;
      caption = message.image?.caption;
      body = caption || '[Image]';
      break;
    case 'video':
      mediaUrl = message.video?.id;
      mediaMimeType = message.video?.mime_type;
      caption = message.video?.caption;
      body = caption || '[Video]';
      break;
    case 'audio':
      mediaUrl = message.audio?.id;
      mediaMimeType = message.audio?.mime_type;
      body = '[Audio]';
      break;
    case 'document':
      mediaUrl = message.document?.id;
      mediaMimeType = message.document?.mime_type;
      caption = message.document?.caption;
      body = caption || '[Document]';
      break;
    default:
      body = `[${message.type}]`;
  }

  const { data, error } = await supabaseAdmin.from('messages').insert({
    message_id: messageId,
    phone_number: from,
    from_number: from,
    to_number: metadata?.phone_number_id || '',
    body: body,
    direction: 'inbound',
    status: 'received',
    timestamp: timestamp,
    message_type: messageType,
    media_url: mediaUrl,
    media_mime_type: mediaMimeType,
    caption: caption,
    is_ai_response: false,
    metadata: webhookData
  }).select();

  return data?.[0] || null;
}

export async function markMessageAsRead(messageId: string) {
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ is_read: true })
    .eq('message_id', messageId);

  if (error) {
    console.error('Error marking message as read:', error);
  }
}
