-- Create triggers for document notifications if they don't exist
DROP TRIGGER IF EXISTS on_document_approved ON public.documents;
CREATE TRIGGER on_document_approved
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_document_approved();

DROP TRIGGER IF EXISTS on_document_rejected ON public.documents;
CREATE TRIGGER on_document_rejected
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_document_rejected();

-- Insert initial company settings if not exists
INSERT INTO public.company_settings (company_name, cnpj, expiration_alert_days, max_upload_size_mb)
SELECT 'Maringa Silos', '00.000.000/0001-00', 30, 10
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings LIMIT 1);