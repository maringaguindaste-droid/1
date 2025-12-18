-- Add company_id to notifications table
ALTER TABLE public.notifications ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Create index for faster queries
CREATE INDEX idx_notifications_company_id ON public.notifications(company_id);

-- Update existing notifications to have a company_id based on the user's default company
UPDATE public.notifications n
SET company_id = (
  SELECT uc.company_id 
  FROM user_companies uc 
  WHERE uc.user_id = n.user_id 
  AND uc.is_default = true
  LIMIT 1
)
WHERE n.company_id IS NULL;

