-- ============================================
-- 1. CRIAR BUCKET DE STORAGE PARA DOCUMENTOS
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760, -- 10MB em bytes
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
);

-- RLS Policies para o bucket employee-documents
CREATE POLICY "Admins podem ver todos os documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Funcionários podem ver seus próprios documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.employees 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Usuários autenticados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (
    -- Admins podem fazer upload de qualquer documento
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
    OR
    -- Funcionários podem fazer upload apenas em suas próprias pastas
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.employees 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins podem deletar documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- ============================================
-- 2. CRIAR TABELA DE HISTÓRICO DE NOTIFICAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS public.notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  days_before_expiration INTEGER NOT NULL,
  notification_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para performance
CREATE INDEX idx_notification_history_document_days 
ON public.notification_history(document_id, days_before_expiration);

-- RLS para notification_history
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage notification history"
ON public.notification_history FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 3. ADICIONAR ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_documents_expiration_date 
ON public.documents(expiration_date) 
WHERE expiration_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_employee_id 
ON public.documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_documents_status 
ON public.documents(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_read 
ON public.notifications(read) 
WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_employees_user_id 
ON public.employees(user_id) 
WHERE user_id IS NOT NULL;

-- ============================================
-- 4. ATUALIZAR FUNÇÃO DE VERIFICAÇÃO DE VENCIMENTO
-- ============================================
CREATE OR REPLACE FUNCTION public.check_document_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  doc_record RECORD;
  days_until_expiration INTEGER;
  alert_days INTEGER[] := ARRAY[30, 15, 10, 7, 3, 1, 0];
  alert_day INTEGER;
  notification_exists BOOLEAN;
  new_notification_id UUID;
BEGIN
  -- Loop através de cada período de alerta
  FOREACH alert_day IN ARRAY alert_days
  LOOP
    -- Buscar documentos que vão vencer no período específico
    FOR doc_record IN 
      SELECT 
        d.id as document_id,
        d.expiration_date,
        dt.name as doc_type_name, 
        e.full_name, 
        e.user_id,
        e.id as employee_id
      FROM documents d
      JOIN document_types dt ON d.document_type_id = dt.id
      JOIN employees e ON d.employee_id = e.id
      WHERE d.expiration_date IS NOT NULL
        AND d.status != 'expired'
        AND d.expiration_date = CURRENT_DATE + alert_day
    LOOP
      days_until_expiration := doc_record.expiration_date - CURRENT_DATE;
      
      -- Verificar se já enviamos notificação para este documento neste período
      SELECT EXISTS (
        SELECT 1 FROM notification_history
        WHERE document_id = doc_record.document_id
          AND days_before_expiration = days_until_expiration
          AND DATE(notification_sent_at) = CURRENT_DATE
      ) INTO notification_exists;
      
      -- Se não existe notificação, criar
      IF NOT notification_exists THEN
        -- Notificar o funcionário se ele tiver acesso ao sistema
        IF doc_record.user_id IS NOT NULL THEN
          INSERT INTO notifications (user_id, type, message)
          VALUES (
            doc_record.user_id,
            CASE 
              WHEN days_until_expiration = 0 THEN 'error'
              WHEN days_until_expiration <= 3 THEN 'error'
              WHEN days_until_expiration <= 7 THEN 'warning'
              ELSE 'info'
            END,
            CASE 
              WHEN days_until_expiration = 0 THEN '🚨 URGENTE: Seu documento "' || doc_record.doc_type_name || '" vence HOJE!'
              WHEN days_until_expiration = 1 THEN '⚠️ ATENÇÃO: Seu documento "' || doc_record.doc_type_name || '" vence AMANHÃ!'
              WHEN days_until_expiration <= 3 THEN '⚠️ URGENTE: Seu documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias!'
              WHEN days_until_expiration <= 7 THEN '⚠️ Seu documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias.'
              ELSE 'ℹ️ Seu documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias.'
            END
          )
          RETURNING id INTO new_notification_id;
          
          -- Registrar no histórico
          INSERT INTO notification_history (document_id, days_before_expiration, notification_id)
          VALUES (doc_record.document_id, days_until_expiration, new_notification_id);
        END IF;
        
        -- Notificar todos os admins
        INSERT INTO notifications (user_id, type, message)
        SELECT 
          ur.user_id,
          CASE 
            WHEN days_until_expiration = 0 THEN 'error'
            WHEN days_until_expiration <= 3 THEN 'error'
            WHEN days_until_expiration <= 7 THEN 'warning'
            ELSE 'info'
          END,
          CASE 
            WHEN days_until_expiration = 0 THEN '🚨 URGENTE: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence HOJE!'
            WHEN days_until_expiration = 1 THEN '⚠️ ATENÇÃO: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence AMANHÃ!'
            WHEN days_until_expiration <= 3 THEN '⚠️ URGENTE: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias!'
            WHEN days_until_expiration <= 7 THEN '⚠️ Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias.'
            ELSE 'ℹ️ Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias.'
          END
        FROM user_roles ur
        WHERE ur.role = 'admin'
        RETURNING id INTO new_notification_id;
        
        -- Registrar notificação do admin no histórico
        IF new_notification_id IS NOT NULL THEN
          INSERT INTO notification_history (document_id, days_before_expiration, notification_id)
          VALUES (doc_record.document_id, days_until_expiration, new_notification_id);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  -- Marcar documentos vencidos
  UPDATE documents
  SET status = 'expired'
  WHERE expiration_date < CURRENT_DATE
    AND status != 'expired';
    
  -- Limpar notificações antigas (mais de 90 dias e já lidas)
  DELETE FROM notifications
  WHERE read = true
    AND created_at < NOW() - INTERVAL '90 days';
    
  -- Limpar histórico antigo (mais de 180 dias)
  DELETE FROM notification_history
  WHERE created_at < NOW() - INTERVAL '180 days';
END;
$function$;

-- ============================================
-- 5. PERMITIR DELETE EM NOTIFICAÇÕES
-- ============================================
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;

CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);