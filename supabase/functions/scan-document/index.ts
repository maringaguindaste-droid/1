import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      throw new Error('Imagem não fornecida');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log('Iniciando análise de documento com IA...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um especialista em OCR de documentos brasileiros. Analise a imagem do documento e extraia as informações de forma precisa.

IMPORTANTE: Responda APENAS com um JSON válido, sem markdown, sem explicações, sem texto adicional.

Formato da resposta:
{
  "success": true,
  "document_type": "RG" | "CNH" | "CTPS" | "CPF" | "OUTRO",
  "data": {
    "full_name": "Nome completo da pessoa",
    "cpf": "Apenas números do CPF, 11 dígitos",
    "rg": "Número do RG com pontuação",
    "birth_date": "Data no formato YYYY-MM-DD",
    "filiation": "Nome dos pais se visível",
    "nationality": "Nacionalidade",
    "naturalness": "Naturalidade/cidade de nascimento"
  },
  "confidence": 0.95
}

Se não conseguir extrair algum campo, use null.
Se a imagem não for um documento válido, retorne: {"success": false, "error": "Imagem não é um documento válido"}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analise este documento brasileiro e extraia todas as informações pessoais visíveis (nome, CPF, RG, data de nascimento, etc). Responda apenas com JSON.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Créditos insuficientes. Por favor, adicione créditos à sua conta.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('Resposta da IA:', content);

    if (!content) {
      throw new Error('Resposta vazia da IA');
    }

    // Parse JSON response
    let parsedResult;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError, 'Content:', content);
      throw new Error('Não foi possível processar a resposta da IA');
    }

    console.log('Dados extraídos:', parsedResult);

    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Erro no scan-document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao processar documento';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
