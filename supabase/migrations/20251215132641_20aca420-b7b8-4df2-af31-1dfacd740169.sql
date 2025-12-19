-- Add document_id and employee_id to notifications for linking
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_document_id ON public.notifications(document_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_id ON public.notifications(employee_id);