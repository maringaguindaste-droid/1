import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppMessage {
  to: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE');

    if (!evolutionApiUrl || !evolutionApiKey || !evolutionInstance) {
      console.log('WhatsApp integration not configured. Skipping...');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'WhatsApp integration not configured',
          skipped: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    const { to, message }: WhatsAppMessage = await req.json();

    if (!to || !message) {
      throw new Error('Missing required fields: to, message');
    }

    // Clean phone number (remove non-digits, ensure country code)
    let cleanPhone = to.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    console.log(`Sending WhatsApp message to ${cleanPhone}`);

    // Evolution API endpoint for sending text messages
    const response = await fetch(`${evolutionApiUrl}/message/sendText/${evolutionInstance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        options: {
          delay: 1200,
          presence: 'composing',
        },
        textMessage: {
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Evolution API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('WhatsApp message sent successfully:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'WhatsApp message sent successfully',
        result 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
