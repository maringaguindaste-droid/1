CREATE OR REPLACE FUNCTION public.check_document_expiration()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  doc_record RECORD;
  days_until_expiration INTEGER;
  new_notification_id UUID;
  notification_exists BOOLEAN;
BEGIN
  -- Buscar TODOS os documentos que vencem nos próximos 30 dias ou já vencidos
  FOR doc_record IN 
    SELECT 
      d.id as document_id,
      d.expiration_date,
      dt.name as doc_type_name, 
      e.full_name, 
      e.user_id,
      e.id as employee_id,
      e.company_id as company_id
    FROM documents d
    JOIN document_types dt ON d.document_type_id = dt.id
    JOIN employees e ON d.employee_id = e.id
    WHERE d.expiration_date IS NOT NULL
      AND d.status != 'expired'
      AND d.expiration_date <= CURRENT_DATE + 30
  LOOP
    days_until_expiration := doc_record.expiration_date - CURRENT_DATE;
    
    -- Verificar se já enviamos notificação para este documento hoje
    SELECT EXISTS (
      SELECT 1 FROM notification_history
      WHERE document_id = doc_record.document_id
        AND days_before_expiration = days_until_expiration
        AND DATE(notification_sent_at) = CURRENT_DATE
    ) INTO notification_exists;
    
    -- Se não existe notificação hoje, criar
    IF NOT notification_exists THEN
      -- Notificar o funcionário se ele tiver acesso ao sistema
      IF doc_record.user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, type, message, company_id, document_id, employee_id)
        VALUES (
          doc_record.user_id,
          CASE 
            WHEN days_until_expiration <= 0 THEN 'error'
            WHEN days_until_expiration <= 3 THEN 'error'
            WHEN days_until_expiration <= 7 THEN 'warning'
            ELSE 'info'
          END,
          CASE 
            WHEN days_until_expiration < 0 THEN '🚨 VENCIDO: Documento "' || doc_record.doc_type_name || '" venceu há ' || ABS(days_until_expiration) || ' dias!'
            WHEN days_until_expiration = 0 THEN '🚨 URGENTE: Documento "' || doc_record.doc_type_name || '" vence HOJE!'
            WHEN days_until_expiration = 1 THEN '⚠️ ATENÇÃO: Documento "' || doc_record.doc_type_name || '" vence AMANHÃ!'
            WHEN days_until_expiration <= 3 THEN '⚠️ URGENTE: Documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias!'
            WHEN days_until_expiration <= 7 THEN '⚠️ Documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias.'
            ELSE 'ℹ️ Documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias.'
          END,
          doc_record.company_id,
          doc_record.document_id,
          doc_record.employee_id
        )
        RETURNING id INTO new_notification_id;
        
        -- Registrar no histórico
        INSERT INTO notification_history (document_id, days_before_expiration, notification_id)
        VALUES (doc_record.document_id, days_until_expiration, new_notification_id);
      END IF;
      
      -- Notificar todos os admins que têm acesso à empresa do funcionário
      INSERT INTO notifications (user_id, type, message, company_id, document_id, employee_id)
      SELECT 
        ur.user_id,
        CASE 
          WHEN days_until_expiration <= 0 THEN 'error'
          WHEN days_until_expiration <= 3 THEN 'error'
          WHEN days_until_expiration <= 7 THEN 'warning'
          ELSE 'info'
        END,
        CASE 
          WHEN days_until_expiration < 0 THEN '🚨 VENCIDO: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' venceu há ' || ABS(days_until_expiration) || ' dias!'
          WHEN days_until_expiration = 0 THEN '🚨 URGENTE: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence HOJE!'
          WHEN days_until_expiration = 1 THEN '⚠️ ATENÇÃO: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence AMANHÃ!'
          WHEN days_until_expiration <= 3 THEN '⚠️ URGENTE: Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias!'
          WHEN days_until_expiration <= 7 THEN '⚠️ Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias.'
          ELSE 'ℹ️ Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias.'
        END,
        doc_record.company_id,
        doc_record.document_id,
        doc_record.employee_id
      FROM user_roles ur
      WHERE ur.role = 'admin'
        AND (
          doc_record.company_id IS NULL 
          OR EXISTS (
            SELECT 1 FROM user_companies uc 
            WHERE uc.user_id = ur.user_id 
            AND uc.company_id = doc_record.company_id
          )
        )
      RETURNING id INTO new_notification_id;
      
      -- Registrar notificação do admin no histórico
      IF new_notification_id IS NOT NULL THEN
        INSERT INTO notification_history (document_id, days_before_expiration, notification_id)
        VALUES (doc_record.document_id, days_until_expiration, new_notification_id);
      END IF;
    END IF;
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