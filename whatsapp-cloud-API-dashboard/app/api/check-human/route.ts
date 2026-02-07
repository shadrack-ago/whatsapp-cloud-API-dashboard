import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get('phone');
    
    console.log('Check-human API called for:', phoneNumber);
    
    if (!phoneNumber) {
      return NextResponse.json({
        error: 'Phone number is required as query parameter',
        humanActive: false,
        example: 'Use: /api/check-human?phone=254768322488'
      }, { status: 400 });
    }
    
    // Clean the phone number (remove + and spaces)
    const cleanPhoneNumber = phoneNumber.replace(/\+/g, '').replace(/\s/g, '').trim();
    
    console.log('Processing phone number:', cleanPhoneNumber);
    
    // Query Supabase for outbound messages (non-AI) in the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('phone_number', cleanPhoneNumber)
      .eq('direction', 'outbound')
      .eq('is_ai_response', false)
      .gte('timestamp', twoHoursAgo)
      .order('timestamp', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        error: 'Failed to check conversation status',
        humanActive: false
      }, { status: 500 });
    }
    
    let humanActive = false;
    let lastHumanResponseTime = null;
    let hoursRemaining = 0;
    
    if (messages && messages.length > 0) {
      const lastMessage = messages[0];
      lastHumanResponseTime = lastMessage.timestamp;
      
      // Calculate hours remaining
      const messageTime = new Date(lastHumanResponseTime).getTime();
      const now = Date.now();
      const hoursElapsed = (now - messageTime) / (1000 * 60 * 60);
      hoursRemaining = Math.max(0, 2 - hoursElapsed);
      humanActive = hoursRemaining > 0;
      
      console.log('Human activity detected at:', lastHumanResponseTime);
    }
    
    const result = {
      phoneNumber: cleanPhoneNumber,
      humanActive,
      lastHumanResponseTime,
      hoursRemaining: Math.round(hoursRemaining * 100) / 100,
      message: humanActive 
        ? `Human is active - AI should wait ${hoursRemaining.toFixed(1)} more hours`
        : "No human activity detected - AI can respond"
    };

    console.log('Returning response:', result);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error checking conversation status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check conversation status',
        humanActive: false
      },
      { status: 500 }
    );
  }
}
