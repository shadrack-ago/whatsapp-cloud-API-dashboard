import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const { to, body, isAiResponse } = await request.json();

    if (!to || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, body' },
        { status: 400 }
      );
    }

    console.log('Sending WhatsApp message:', { to, body, isAiResponse: isAiResponse || false });

    // Send message via WhatsApp Cloud API
    const data = await sendWhatsAppMessage(to, body, isAiResponse || false);

    console.log('Message sent successfully:', data);
    return NextResponse.json({ message: data, success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    );
  }
}
