
-- 1. Criar tabela de empresas
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  logo_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS na tabela companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS para companies
CREATE POLICY "Everyone can view active companies" ON public.companies
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage companies" ON public.companies
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 4. Criar tabela de associação usuário-empresa
CREATE TABLE IF NOT EXISTS public.user_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- 5. Habilitar RLS na tabela user_companies
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS para user_companies
CREATE POLICY "Users can view their own company associations" ON public.user_companies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user companies" ON public.user_companies
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7. Adicionar company_id nas tabelas existentes
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.document_types ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 8. Inserir as duas empresas
INSERT INTO public.companies (name, cnpj) VALUES 
  ('Maringa Silos', '00.000.000/0001-01'),
  ('Maringa Guindaste', '00.000.000/0001-02')
ON CONFLICT DO NOTHING;

-- 9. Criar função para verificar acesso à empresa
CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies
    WHERE user_id = _user_id
      AND company_id = _company_id
  ) OR public.has_role(_user_id, 'admin')
$$;

-- 10. Atualizar políticas de employees para incluir filtro por empresa
DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;
CREATE POLICY "Employees can view their own data" ON public.employees
  FOR SELECT USING (
    auth.uid() = user_id OR 
    public.has_company_access(auth.uid(), company_id)
  );

-- 11. Habilitar realtime para tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;

-- 12. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_user_id ON public.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company_id ON public.user_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_document_types_company_id ON public.document_types(company_id);

-- 13. Trigger para updated_at na companies
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
