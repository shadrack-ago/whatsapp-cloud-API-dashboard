import { NextRequest, NextResponse } from 'next/server';
import { storeInboundMessage } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    console.log('Webhook verification request:', { mode, token: token ? 'present' : 'missing' });

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return new NextResponse(challenge, { status: 200 });
    }

    console.error('Webhook verification failed');
    return new NextResponse('Forbidden', { status: 403 });
  } catch (error) {
    console.error('Webhook verification error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    // Log webhook to database for debugging
    const { supabaseAdmin } = await import('@/lib/whatsapp');
    await supabaseAdmin.from('webhook_logs').insert({
      event_type: body.entry?.[0]?.changes?.[0]?.field || 'unknown',
      payload: body,
      processed: false
    });

    // Check if this is a message webhook
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses;

    if (messages && messages.length > 0) {
      console.log('Processing incoming message...');
      
      // Store the incoming message
      const storedMessage = await storeInboundMessage(body);
      
      if (storedMessage) {
        console.log('Message stored successfully:', storedMessage.message_id);
        
        // Mark webhook as processed
        await supabaseAdmin.from('webhook_logs').insert({
          event_type: 'message_received',
          payload: body,
          processed: true
        });
      }
    } else if (statuses && statuses.length > 0) {
      // Handle message status updates (sent, delivered, read, failed)
      console.log('Processing status update...');
      
      for (const status of statuses) {
        const messageId = status.id;
        const newStatus = status.status;
        
        // Update message status in database
        const { error } = await supabaseAdmin
          .from('messages')
          .update({ status: newStatus })
          .eq('message_id', messageId);
        
        if (error) {
          console.error('Error updating message status:', error);
        } else {
          console.log(`Message ${messageId} status updated to ${newStatus}`);
        }
      }
      
      // Mark webhook as processed
      await supabaseAdmin.from('webhook_logs').insert({
        event_type: 'status_update',
        payload: body,
        processed: true
      });
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Log error to database
    try {
      const { supabaseAdmin } = await import('@/lib/whatsapp');
      await supabaseAdmin.from('webhook_logs').insert({
        event_type: 'error',
        payload: { error: error instanceof Error ? error.message : 'Unknown error' },
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }
    
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
