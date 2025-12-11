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
            content: `Você é um especialista em OCR de documentos brasileiros. Analise a imagem do documento e extraia TODAS as informações possíveis de forma precisa.

IMPORTANTE: Responda APENAS com um JSON válido, sem markdown, sem explicações, sem texto adicional.

Tipos de documentos que você pode encontrar:
- RG (Registro Geral): nome, CPF, RG, nascimento, filiação, naturalidade, nacionalidade
- CNH (Carteira Nacional de Habilitação): nome, CPF, RG, nascimento, filiação, endereço
- CTPS (Carteira de Trabalho): nome, CPF, cargo/função, data de admissão, local de trabalho
- Comprovante de Endereço: CEP, município, bairro, endereço completo
- Ficha de Registro/Cadastro: TODOS os dados do funcionário incluindo endereço completo e dados do contrato
- Contrato de Trabalho: nome, cargo, data de admissão, salário
- ASO (Atestado de Saúde): nome, CPF, data de validade/validação, cargo

=== ATENÇÃO ESPECIAL PARA FICHA DE REGISTRO / CADASTRO ===
Este documento é dividido em SEÇÕES. Analise TODAS as seções:

1. SEÇÃO "TRABALHADOR" (topo):
   - Nome completo do funcionário
   - Matrícula
   - Nome do Pai e Nome da Mãe (filiation)
   - Nacionalidade
   - Naturalidade (cidade de nascimento)

2. SEÇÃO "IDENTIFICAÇÃO":
   - Sexo
   - Data de Nascimento (birth_date)
   - CTPS (número e série)
   - CPF
   - RG
   - Estado Civil

3. SEÇÃO "ENDEREÇO" - MUITO IMPORTANTE:
   - Endereço (rua + número) → campo "address"
   - Bairro → campo "neighborhood"  
   - Cidade → campo "municipality"
   - Estado
   - CEP → campo "cep" (apenas 8 números)

4. SEÇÃO "CONTRATO" - MUITO IMPORTANTE:
   - Data de Admissão → campo "admission_date" (formato YYYY-MM-DD)
   - CBO / Função → campo "position" (cargo do funcionário)
   - Data do Registro
   - Salário Base

5. SEÇÃO "PIS":
   - Número do PIS/PASEP

Formato da resposta:
{
  "success": true,
  "document_type": "RG" | "CNH" | "CTPS" | "COMPROVANTE" | "FICHA_REGISTRO" | "CONTRATO" | "ASO" | "OUTRO",
  "data": {
    "full_name": "Nome completo da pessoa",
    "cpf": "Apenas números do CPF, 11 dígitos",
    "rg": "Número do RG com pontuação",
    "birth_date": "Data no formato YYYY-MM-DD",
    "filiation": "Nome dos pais se visível",
    "nationality": "Nacionalidade",
    "naturalness": "Naturalidade/cidade de nascimento",
    "cep": "CEP apenas números, 8 dígitos",
    "municipality": "Cidade/Município",
    "neighborhood": "Bairro",
    "address": "Endereço completo (rua, número, complemento)",
    "phone": "Telefone fixo se visível",
    "mobile": "Celular se visível",
    "email": "Email se visível",
    "position": "Cargo/Função do funcionário - procure em CBO/Função na seção CONTRATO",
    "admission_date": "Data de admissão formato YYYY-MM-DD - procure em Admissão na seção CONTRATO",
    "validation_date": "Data de validação/validade formato YYYY-MM-DD",
    "responsible_function": "Função responsável se visível",
    "work_location": "Local de trabalho/obra se visível"
  },
  "confidence": 0.95
}

INSTRUÇÕES CRÍTICAS:
1. Extraia TODOS os campos que conseguir identificar no documento - ANALISE O DOCUMENTO INTEIRO
2. Para datas, sempre converta para o formato YYYY-MM-DD (ex: 10/07/2023 → 2023-07-10)
3. Para CPF, remova pontuação e mantenha apenas 11 números
4. Para CEP, remova pontuação e mantenha apenas 8 números
5. Se não conseguir extrair algum campo, use null
6. NUNCA retorne null para campos que estão VISÍVEIS no documento
7. Para FICHA DE REGISTRO: O cargo está em "CBO / Função" na seção CONTRATO
8. Para FICHA DE REGISTRO: A data de admissão está em "Admissão" na seção CONTRATO
9. Para FICHA DE REGISTRO: O endereço está dividido em campos separados na seção ENDEREÇO
10. Se a imagem não for um documento válido, retorne: {"success": false, "error": "Imagem não é um documento válido"}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analise este documento brasileiro e extraia TODAS as informações visíveis: dados pessoais (nome, CPF, RG, nascimento, filiação), endereço (CEP, cidade, bairro, rua), contato (telefone, celular, email), e dados profissionais (cargo, data de admissão, data de validação, local de trabalho). Responda apenas com JSON.'
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
