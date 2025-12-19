import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WhatsApp notification number (configurable)
const WHATSAPP_ADMIN_NUMBER = '44988068262';

interface ExpiringDocument {
  employee_name: string;
  document_type: string;
  expiration_date: string;
  days_until: number;
  company_name: string;
}

interface DocumentIssue {
  id: string;
  employee_name: string;
  document_type: string;
  issue_type: 'missing_signature' | 'missing_date' | 'incomplete';
  company_id: string;
  employee_id: string;
}

// Check if document has signature info in observations
// New format: "Assinaturas: 3/3 (Empresa ✓, Instrutor ✓, Funcionário ✓)"
function hasSignatureInfo(observations: string | null): boolean {
  if (!observations) return false;
  const lowerObs = observations.toLowerCase();
  // Check for new format
  if (observations.includes('Assinaturas:')) return true;
  // Legacy format checks
  return lowerObs.includes('assinatura') || 
         lowerObs.includes('assinado') || 
         lowerObs.includes('signature') ||
         lowerObs.includes('completamente assinado') ||
         lowerObs.includes('parcialmente assinado');
}

// Check if signature is complete (3/3)
function isSignatureComplete(observations: string | null): boolean {
  if (!observations) return false;
  // Check for new format "Assinaturas: 3/3"
  if (observations.includes('Assinaturas: 3/3')) return true;
  // Legacy checks
  const lowerObs = observations.toLowerCase();
  return lowerObs.includes('completamente assinado') || 
         lowerObs.includes('3 assinaturas') ||
         lowerObs.includes('todas as assinaturas');
}

// Check if document type requires validity (NR documents and ASO)
function requiresValidity(docCode: string | null, docName: string | null): boolean {
  if (!docCode && !docName) return false;
  const code = (docCode || '').toUpperCase();
  const name = (docName || '').toUpperCase();
  // NR documents and ASO require validity
  return code.startsWith('NR') || code === 'ASO' || 
         name.includes('NR') || name.includes('ASO') || 
         name.includes('ATESTADO DE SAÚDE');
}

async function sendWhatsAppNotification(
  supabaseClient: any,
  documents: ExpiringDocument[],
  documentIssues: DocumentIssue[] = []
) {
  if (documents.length === 0 && documentIssues.length === 0) return;

  // Group by urgency
  const urgent = documents.filter(d => d.days_until <= 3);
  const warning = documents.filter(d => d.days_until > 3 && d.days_until <= 7);
  const notice = documents.filter(d => d.days_until > 7);

  const today = new Date().toLocaleDateString('pt-BR');
  let message = `🔔 *ALERTA DE DOCUMENTOS*\n📅 Data: ${today}\n\n`;

  if (urgent.length > 0) {
    message += '🚨 *URGENTE (até 3 dias):*\n';
    urgent.forEach(d => {
      message += `• ${d.employee_name} - ${d.document_type}\n`;
      message += `  📅 Vence: ${new Date(d.expiration_date).toLocaleDateString('pt-BR')}\n`;
    });
    message += '\n';
  }

  if (warning.length > 0) {
    message += '⚠️ *ATENÇÃO (até 7 dias):*\n';
    warning.forEach(d => {
      message += `• ${d.employee_name} - ${d.document_type}\n`;
      message += `  📅 Vence em ${d.days_until} dias\n`;
    });
    message += '\n';
  }

  if (notice.length > 0) {
    message += `ℹ️ *Outros (${notice.length} documentos)*\n\n`;
  }

  // Add signature issues
  if (documentIssues.length > 0) {
    const signatureIssues = documentIssues.filter(d => d.issue_type === 'missing_signature');
    const dateIssues = documentIssues.filter(d => d.issue_type === 'missing_date');
    
    if (signatureIssues.length > 0) {
      message += `✍️ *SEM ASSINATURA (${signatureIssues.length}):*\n`;
      signatureIssues.slice(0, 5).forEach(d => {
        message += `• ${d.employee_name} - ${d.document_type}\n`;
      });
      if (signatureIssues.length > 5) {
        message += `  ...e mais ${signatureIssues.length - 5}\n`;
      }
      message += '\n';
    }

    if (dateIssues.length > 0) {
      message += `📅 *SEM DATA DE VALIDADE (${dateIssues.length}):*\n`;
      dateIssues.slice(0, 5).forEach(d => {
        message += `• ${d.employee_name} - ${d.document_type}\n`;
      });
      if (dateIssues.length > 5) {
        message += `  ...e mais ${dateIssues.length - 5}\n`;
      }
      message += '\n';
    }
  }

  message += '\n_Acesse o sistema para mais detalhes._';

  try {
    // Try to send WhatsApp notification
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: WHATSAPP_ADMIN_NUMBER,
          message: message,
        }),
      }
    );

    const result = await response.json();
    if (result.success) {
      console.log('WhatsApp notification sent successfully');
    } else if (result.skipped) {
      console.log('WhatsApp not configured, skipping notification');
    } else {
      console.error('Failed to send WhatsApp:', result.error);
    }
  } catch (error) {
    console.error('Error sending WhatsApp notification:', error);
  }
}

async function createNotificationForIssue(
  supabaseClient: any,
  issue: DocumentIssue,
  adminUserIds: string[]
) {
  const issueMessages: Record<string, string> = {
    'missing_signature': `✍️ Documento "${issue.document_type}" de ${issue.employee_name} está SEM ASSINATURA verificada`,
    'missing_date': `📅 Documento "${issue.document_type}" de ${issue.employee_name} está SEM DATA DE VALIDADE`,
    'incomplete': `⚠️ Documento "${issue.document_type}" de ${issue.employee_name} está INCOMPLETO`,
  };

  const message = issueMessages[issue.issue_type] || `Problema no documento de ${issue.employee_name}`;

  // Check if notification already exists today for this issue
  const today = new Date().toISOString().split('T')[0];
  
  for (const userId of adminUserIds) {
    const { data: existing } = await supabaseClient
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('document_id', issue.id)
      .eq('type', 'warning')
      .gte('created_at', today)
      .single();

    if (!existing) {
      await supabaseClient
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'warning',
          message: message,
          company_id: issue.company_id,
          document_id: issue.id,
          employee_id: issue.employee_id,
          read: false,
        });
      console.log(`Created notification for ${issue.issue_type}: ${issue.document_type} - ${issue.employee_name}`);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for expiring documents and document issues...');

    // Get all admin users
    const { data: adminUsers } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminUserIds = (adminUsers || []).map((u: any) => u.user_id);
    console.log(`Found ${adminUserIds.length} admin users`);

    // Fetch all documents with file_path (uploaded) to check for issues
    // Exclude terminated employees (DEMITIDO)
    const { data: allDocuments, error: allDocsError } = await supabaseClient
      .from('documents')
      .select(`
        id,
        expiration_date,
        observations,
        status,
        file_path,
        document_types!inner(name, code, default_validity_years),
        employees!inner(id, full_name, company_id, status)
      `)
      .not('file_path', 'is', null)
      .neq('file_path', '')
      .neq('employees.status', 'DEMITIDO');

    if (allDocsError) {
      console.error('Error fetching documents:', allDocsError);
    }

    const documentIssues: DocumentIssue[] = [];

    // Check each document for issues
    for (const doc of (allDocuments || [])) {
      const docTypes = doc.document_types as any;
      const employees = doc.employees as any;
      
      const docType = docTypes?.name || 'Documento';
      const docCode = docTypes?.code || '';
      const employeeName = employees?.full_name || 'Desconhecido';
      const companyId = employees?.company_id;
      const employeeId = employees?.id;
      
      // Only check documents that REQUIRE validity (NR and ASO)
      const docRequiresValidity = requiresValidity(docCode, docType);

      // Check for missing signatures (only for NR/ASO documents that require signatures)
      if (docRequiresValidity && !hasSignatureInfo(doc.observations)) {
        documentIssues.push({
          id: doc.id,
          employee_name: employeeName,
          document_type: docType,
          issue_type: 'missing_signature',
          company_id: companyId,
          employee_id: employeeId,
        });
      }

      // Check for missing expiration date (only for docs that require validity)
      if (docRequiresValidity && !doc.expiration_date) {
        documentIssues.push({
          id: doc.id,
          employee_name: employeeName,
          document_type: docType,
          issue_type: 'missing_date',
          company_id: companyId,
          employee_id: employeeId,
        });
      }
    }

    console.log(`Found ${documentIssues.length} document issues`);
    console.log(`- Missing signatures: ${documentIssues.filter(d => d.issue_type === 'missing_signature').length}`);
    console.log(`- Missing dates: ${documentIssues.filter(d => d.issue_type === 'missing_date').length}`);

    // Create notifications for document issues
    for (const issue of documentIssues) {
      await createNotificationForIssue(supabaseClient, issue, adminUserIds);
    }

    // Fetch documents expiring in the next 30 days for WhatsApp summary
    // Exclude terminated employees (DEMITIDO)
    const { data: expiringDocs, error: fetchError } = await supabaseClient
      .from('documents')
      .select(`
        id,
        expiration_date,
        document_types!inner(name),
        employees!inner(full_name, company_id, status)
      `)
      .gte('expiration_date', new Date().toISOString().split('T')[0])
      .lte('expiration_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .neq('status', 'expired')
      .neq('employees.status', 'DEMITIDO');

    if (fetchError) {
      console.error('Error fetching expiring documents:', fetchError);
    }

    // Prepare documents for WhatsApp
    const documentsForWhatsApp: ExpiringDocument[] = (expiringDocs || []).map((doc: any) => ({
      employee_name: doc.employees?.full_name || 'Desconhecido',
      document_type: doc.document_types?.name || 'Documento',
      expiration_date: doc.expiration_date,
      days_until: Math.ceil((new Date(doc.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      company_name: 'Empresa',
    }));

    // Send WhatsApp notification if there are urgent documents (expiring in 7 days or less) or issues
    const urgentDocs = documentsForWhatsApp.filter(d => d.days_until <= 7);
    if (urgentDocs.length > 0 || documentIssues.length > 0) {
      await sendWhatsAppNotification(supabaseClient, urgentDocs, documentIssues);
    }

    // Call the database function that checks and creates notifications for expirations
    const { error: functionError } = await supabaseClient
      .rpc('check_document_expiration');

    if (functionError) {
      console.error('Error calling check_document_expiration:', functionError);
      throw functionError;
    }

    console.log('Document expiration check completed successfully');
    console.log(`Found ${documentsForWhatsApp.length} documents expiring in next 30 days`);
    console.log(`${urgentDocs.length} urgent documents (7 days or less)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Document expiration and issue check completed',
        stats: {
          total_expiring: documentsForWhatsApp.length,
          urgent: urgentDocs.length,
          issues: {
            total: documentIssues.length,
            missing_signatures: documentIssues.filter(d => d.issue_type === 'missing_signature').length,
            missing_dates: documentIssues.filter(d => d.issue_type === 'missing_date').length,
          }
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error:', error);
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
