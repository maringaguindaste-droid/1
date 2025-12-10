
-- Drop existing policies for documents SELECT
DROP POLICY IF EXISTS "Employees can view their own documents" ON documents;

-- Create new policy: Managers can view all documents of employees from their company
CREATE POLICY "Managers can view company documents"
ON documents
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR 
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = documents.employee_id
    AND has_company_access(auth.uid(), e.company_id)
  )
);

-- Update employees policy to be clearer
DROP POLICY IF EXISTS "Employees can view their own data" ON employees;

-- Create new policy: Managers can view all employees from their assigned companies
CREATE POLICY "Managers can view company employees"
ON employees
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR 
  has_company_access(auth.uid(), company_id)
);

-- Also drop and recreate the admin policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can view all employees" ON employees;
DROP POLICY IF EXISTS "Admins can view all documents" ON documents;
