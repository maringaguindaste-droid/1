import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignatureResult {
  count: number;
  has_company_signature: boolean;
  has_instructor_signature: boolean;
  has_employee_signature: boolean;
  is_fully_signed: boolean;
  details: string;
}

function formatSignatureObservation(signatures: SignatureResult): string {
  const parts = [
    `Empresa ${signatures.has_company_signature ? '✓' : '✗'}`,
    `Instrutor ${signatures.has_instructor_signature ? '✓' : '✗'}`,
    `Funcionário ${signatures.has_employee_signature ? '✓' : '✗'}`
  ];
  
  const status = signatures.is_fully_signed || signatures.count === 3 
    ? 'Completamente assinado' 
    : signatures.count > 0 
      ? 'Parcialmente assinado' 
      : 'Sem assinaturas';
  
  return `Assinaturas: ${signatures.count}/3 (${parts.join(', ')}) - ${status}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 10 } = await req.json().catch(() => ({}));
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Buscando documentos NR/ASO sem informação de assinatura...');

    // Get all documents from active employees (will filter for missing signatures in JS)
    const { data: documents, error: fetchError } = await supabaseClient
      .from('documents')
      .select(`
        id,
        file_path,
        observations,
        document_types!inner(code, name),
        employees!inner(id, full_name, status)
      `)
      .not('file_path', 'is', null)
      .neq('file_path', '')
      .limit(500);

    if (fetchError) {
      throw fetchError;
    }

    // Filter: active employees + NR/ASO docs + no signature info
    const filteredDocs = (documents || []).filter((doc: any) => {
      const emp = Array.isArray(doc.employees) ? doc.employees[0] : doc.employees;
      const docType = Array.isArray(doc.document_types) ? doc.document_types[0] : doc.document_types;
      
      // Skip terminated employees
      if (emp?.status === 'DEMITIDO') return false;
      
      // Check if NR/ASO document
      const code = (docType?.code || '').toUpperCase();
      const name = (docType?.name || '').toUpperCase();
      const isNrOrAso = code.startsWith('NR') || code === 'ASO' || name.includes('NR') || name.includes('ASO');
      if (!isNrOrAso) return false;
      
      // Check if missing signature info
      const obs = doc.observations || '';
      const hasSignatureInfo = obs.includes('Assinaturas:');
      return !hasSignatureInfo;
    }).slice(0, limit);

    console.log(`Encontrados ${filteredDocs.length} documentos para verificar assinaturas`);

    const results: any[] = [];

    for (const doc of filteredDocs) {
      try {
        const docType = Array.isArray(doc.document_types) ? doc.document_types[0] : doc.document_types;
        console.log(`Analisando documento ${doc.id} (${docType?.code})...`);

        // Download file from storage
        const { data: fileData, error: downloadError } = await supabaseClient.storage
          .from('employee-documents')
          .download(doc.file_path);

        if (downloadError) {
          console.error(`Erro ao baixar arquivo ${doc.file_path}:`, downloadError);
          results.push({ id: doc.id, success: false, error: 'Erro ao baixar arquivo' });
          continue;
        }

        // Convert to base64 using Deno's efficient encoder
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = base64Encode(arrayBuffer);
        
        const mimeType = doc.file_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        const base64WithPrefix = `data:${mimeType};base64,${base64}`;

        // Call AI to analyze signatures only
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
                content: `Você é um especialista em verificar assinaturas em documentos de treinamento brasileiros (certificados NR).

ANALISE APENAS AS ASSINATURAS do documento. Certificados NR geralmente têm 3 campos:
1. ASSINATURA DA EMPRESA/CONTRATANTE (esquerda ou primeiro campo)
2. ASSINATURA DO INSTRUTOR/TÉCNICO (centro ou segundo campo)
3. ASSINATURA DO FUNCIONÁRIO/TRABALHADOR (direita ou terceiro campo)

REGRAS:
- Campo ASSINADO = rabisco manuscrito, carimbo com assinatura, nome escrito à mão, assinatura digital
- Campo VAZIO = em branco, apenas linha pontilhada, apenas texto do label

RESPONDA APENAS COM JSON:
{
  "count": 0 | 1 | 2 | 3,
  "has_company_signature": true | false,
  "has_instructor_signature": true | false,
  "has_employee_signature": true | false,
  "is_fully_signed": true | false,
  "details": "Empresa: ✓/✗ | Instrutor: ✓/✗ | Funcionário: ✓/✗"
}`
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Verifique APENAS as assinaturas deste documento. Conte quantas assinaturas existem e identifique de quem são (empresa, instrutor, funcionário).'
                  },
                  {
                    type: 'image_url',
                    image_url: { url: base64WithPrefix }
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
            results.push({ id: doc.id, success: false, error: 'Rate limit' });
            // Wait longer before continuing due to rate limits
            console.log('Rate limited, waiting 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          }
          
          results.push({ id: doc.id, success: false, error: `API error: ${response.status}` });
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          results.push({ id: doc.id, success: false, error: 'Resposta vazia da IA' });
          continue;
        }

        // Parse response
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const signatures: SignatureResult = JSON.parse(cleanContent);

        // Format observation
        const signatureObs = formatSignatureObservation(signatures);
        
        // Update document observations
        let newObservations = doc.observations || '';
        // Remove old signature info if present
        newObservations = newObservations.replace(/Assinaturas:.*$/m, '').trim();
        // Add new signature info
        newObservations = newObservations ? `${newObservations}\n${signatureObs}` : signatureObs;

        const { error: updateError } = await supabaseClient
          .from('documents')
          .update({ observations: newObservations })
          .eq('id', doc.id);

        if (updateError) {
          console.error('Erro ao atualizar documento:', updateError);
          results.push({ id: doc.id, success: false, error: 'Erro ao atualizar' });
        } else {
          console.log(`Documento ${doc.id} atualizado: ${signatures.count}/3 assinaturas`);
          results.push({ 
            id: doc.id, 
            success: true, 
            signatures: signatures.count,
            details: signatures.details
          });
        }

        // Longer delay between requests to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error) {
        console.error(`Erro ao processar documento ${doc.id}:`, error);
        results.push({ id: doc.id, success: false, error: String(error) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const signatureCounts = {
      '3/3': results.filter(r => r.success && r.signatures === 3).length,
      '2/3': results.filter(r => r.success && r.signatures === 2).length,
      '1/3': results.filter(r => r.success && r.signatures === 1).length,
      '0/3': results.filter(r => r.success && r.signatures === 0).length,
    };

    console.log(`Re-scan concluído: ${successCount}/${filteredDocs.length} sucesso`);
    console.log('Distribuição de assinaturas:', signatureCounts);

    return new Response(JSON.stringify({
      success: true,
      total: filteredDocs.length,
      processed: successCount,
      signatureCounts,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Erro no rescan-signatures:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
