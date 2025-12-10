
-- Create trigger for auto-creating profiles on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create notification_history table if not exists
CREATE TABLE IF NOT EXISTS public.notification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  days_before_expiration integer NOT NULL,
  notification_sent_at timestamptz NOT NULL DEFAULT now(),
  notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on notification_history
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

-- Policy for notification_history
DROP POLICY IF EXISTS "System can manage notification history" ON public.notification_history;
CREATE POLICY "System can manage notification history"
ON public.notification_history
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_notification_history_document ON notification_history(document_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_days ON notification_history(days_before_expiration);

-- Update check_document_expiration function to be more robust
CREATE OR REPLACE FUNCTION public.check_document_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Create indexes for better performance on documents
CREATE INDEX IF NOT EXISTS idx_documents_expiration ON documents(expiration_date);
CREATE INDEX IF NOT EXISTS idx_documents_employee ON documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
