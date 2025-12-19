import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { files } = await req.json();
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('Nenhum arquivo fornecido');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    console.log(`Iniciando análise de ${files.length} documento(s)...`);

    const results = [];

    for (const file of files) {
      try {
        console.log(`Analisando arquivo: ${file.fileName || file.name}`);

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
                content: `Você é um especialista em análise de documentos corporativos brasileiros.
Analise a imagem e identifique o tipo de documento, as datas relevantes e VERIFIQUE AS ASSINATURAS.

TIPOS DE DOCUMENTOS (use o código exato):
- ASO: Atestado de Saúde Ocupacional
- NR05: Certificado NR-05 (CIPA)
- NR06: Certificado NR-06 (EPI)
- NR10: Certificado NR-10 (Segurança em Instalações Elétricas)
- NR11: Certificado NR-11 (Transporte e Movimentação de Cargas)
- NR12: Certificado NR-12 (Segurança em Máquinas)
- NR13: Certificado NR-13 (Caldeiras e Vasos de Pressão)
- NR17: Certificado NR-17 (Ergonomia)
- NR18: Certificado NR-18 (Construção Civil)
- NR20: Certificado NR-20 (Inflamáveis e Combustíveis)
- NR23: Certificado NR-23 (Proteção Contra Incêndios)
- NR26: Certificado NR-26 (Sinalização de Segurança)
- NR31: Certificado NR-31 (Agricultura)
- NR33: Certificado NR-33 (Espaços Confinados)
- NR34: Certificado NR-34 (Construção Naval)
- NR35: Certificado NR-35 (Trabalho em Altura)
- CNH: Carteira Nacional de Habilitação
- CTPS: Carteira de Trabalho
- RG: Documento de Identidade
- CPF: Cadastro de Pessoa Física
- FICHA_EPI: Ficha de EPI
- TERMO_CONF: Termo de Confidencialidade
- FOTO: Foto do Funcionário
- REG_TEC: Registro de Técnico de Segurança
- S2200: Relatório eSocial
- ORDEM_SERVICO: Ordem de Serviço
- CONTRATO: Contrato de Trabalho
- FICHA_REGISTRO: Ficha de Registro
- COMP_RESID: Comprovante de Residência
- OUTRO: Outro tipo de documento

IMPORTANTE SOBRE DATAS:
- expiration_date: Data de VALIDADE/VENCIMENTO explícita no documento (se houver)
- emission_date: Data de EMISSÃO/REALIZAÇÃO do treinamento ou curso (SEMPRE busque essa data!)

Para certificados de treinamento (NR10, NR35, etc), geralmente a data visível é a data do TREINAMENTO (emission_date).
O sistema calculará a validade automaticamente baseado nos anos padrão.

VERIFICAÇÃO DE ASSINATURAS (MUITO IMPORTANTE):
Certificados NR geralmente têm 3 campos de assinatura:
1. ASSINATURA DA EMPRESA/CONTRATANTE (esquerda ou primeiro campo) - assinatura do representante da empresa contratante
2. ASSINATURA DO INSTRUTOR/TÉCNICO (centro ou segundo campo) - assinatura de quem ministrou o treinamento
3. ASSINATURA DO FUNCIONÁRIO/TRABALHADOR (direita ou terceiro campo) - assinatura do participante do curso

REGRAS PARA IDENTIFICAR ASSINATURAS:
- Um campo está ASSINADO se contém: rabisco manuscrito, carimbo com assinatura, nome escrito à mão, ou assinatura digital
- Um campo está VAZIO se: está em branco, tem apenas linha pontilhada, ou tem apenas o texto do label
- Conte CADA CAMPO que tem uma assinatura real

has_company_signature = se o campo da empresa/contratante está assinado
has_instructor_signature = se o campo do instrutor/técnico está assinado  
has_employee_signature = se o campo do funcionário/trabalhador está assinado
is_fully_signed = se TODOS os 3 campos estão assinados

RESPONDA APENAS COM JSON VÁLIDO, sem markdown:
{
  "success": true,
  "document_type_code": "CODIGO",
  "document_type_name": "Nome completo do tipo",
  "expiration_date": "YYYY-MM-DD ou null",
  "emission_date": "YYYY-MM-DD ou null",
  "observations": "Observações relevantes",
  "confidence": 0.0 a 1.0,
  "signatures": {
    "count": 0 | 1 | 2 | 3,
    "has_company_signature": true | false,
    "has_instructor_signature": true | false,
    "has_employee_signature": true | false,
    "is_fully_signed": true | false,
    "details": "Empresa: ✓/✗ | Instrutor: ✓/✗ | Funcionário: ✓/✗"
  }
}

Se não conseguir analisar: {"success": false, "error": "Motivo"}`
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Analise este documento e identifique: 1) tipo do documento, 2) data de emissão/realização, 3) data de validade/vencimento (se houver), 4) ASSINATURAS presentes (quantas existem e de quem são).'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: file.base64.startsWith('data:') ? file.base64 : `data:image/jpeg;base64,${file.base64}`
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
            results.push({
              fileName: file.fileName || file.name,
              success: false,
              error: 'Limite de requisições excedido. Aguarde alguns segundos.'
            });
            continue;
          }
          
          if (response.status === 402) {
            results.push({
              fileName: file.fileName || file.name,
              success: false,
              error: 'Créditos insuficientes.'
            });
            continue;
          }
          
          throw new Error(`Erro na API: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        console.log('Resposta da IA para', file.fileName || file.name, ':', content);

        if (!content) {
          results.push({
            fileName: file.fileName || file.name,
            success: false,
            error: 'Resposta vazia da IA'
          });
          continue;
        }

        try {
          const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
          const parsedResult = JSON.parse(cleanContent);
          
          // Ensure signatures object exists with standardized fields
          if (!parsedResult.signatures) {
            parsedResult.signatures = {
              count: 0,
              has_company_signature: false,
              has_instructor_signature: false,
              has_employee_signature: false,
              is_fully_signed: false,
              details: 'Empresa: ✗ | Instrutor: ✗ | Funcionário: ✗'
            };
          } else {
            // Normalize field names
            if ('has_responsible_signature' in parsedResult.signatures && !('has_company_signature' in parsedResult.signatures)) {
              parsedResult.signatures.has_company_signature = parsedResult.signatures.has_responsible_signature;
            }
            // Add details if missing
            if (!parsedResult.signatures.details) {
              const sig = parsedResult.signatures;
              parsedResult.signatures.details = `Empresa: ${sig.has_company_signature ? '✓' : '✗'} | Instrutor: ${sig.has_instructor_signature ? '✓' : '✗'} | Funcionário: ${sig.has_employee_signature ? '✓' : '✗'}`;
            }
          }
          
          results.push({
            fileName: file.fileName || file.name,
            fileBase64: file.base64,
            mimeType: file.mimeType,
            ...parsedResult
          });
        } catch (parseError) {
          console.error('Erro ao parsear JSON:', parseError);
          results.push({
            fileName: file.fileName || file.name,
            success: false,
            error: 'Não foi possível processar a resposta'
          });
        }

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (fileError) {
        console.error('Erro ao processar arquivo:', file.fileName || file.name, fileError);
        results.push({
          fileName: file.fileName || file.name,
          success: false,
          error: fileError instanceof Error ? fileError.message : 'Erro ao processar arquivo'
        });
      }
    }

    console.log(`Análise concluída: ${results.filter(r => r.success).length}/${files.length} sucesso`);

    return new Response(JSON.stringify({ 
      success: true,
      total: files.length,
      processed: results.filter(r => r.success).length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Erro no scan-document-pack:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao processar documentos';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
