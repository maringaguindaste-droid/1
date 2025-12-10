--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'employee'
);


--
-- Name: document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);


--
-- Name: any_admin_exists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.any_admin_exists() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  );
$$;


--
-- Name: check_document_expiration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_document_expiration() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  doc_record RECORD;
  days_until_expiration INTEGER;
  employee_record RECORD;
BEGIN
  -- Buscar documentos que vão vencer nos próximos 30 dias
  FOR doc_record IN 
    SELECT d.*, dt.name as doc_type_name, e.full_name, e.user_id
    FROM documents d
    JOIN document_types dt ON d.document_type_id = dt.id
    JOIN employees e ON d.employee_id = e.id
    WHERE d.expiration_date IS NOT NULL
      AND d.status != 'expired'
      AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
  LOOP
    days_until_expiration := doc_record.expiration_date - CURRENT_DATE;
    
    -- Notificar o funcionário se ele tiver acesso ao sistema
    IF doc_record.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, message)
      VALUES (
        doc_record.user_id,
        'warning',
        'Seu documento "' || doc_record.doc_type_name || '" vence em ' || days_until_expiration || ' dias.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Notificar todos os admins
    INSERT INTO notifications (user_id, type, message)
    SELECT 
      ur.user_id,
      'warning',
      'Documento "' || doc_record.doc_type_name || '" de ' || doc_record.full_name || ' vence em ' || days_until_expiration || ' dias.'
    FROM user_roles ur
    WHERE ur.role = 'admin';
  END LOOP;
  
  -- Marcar documentos vencidos
  UPDATE documents
  SET status = 'expired'
  WHERE expiration_date < CURRENT_DATE
    AND status != 'expired';
END;
$$;


--
-- Name: create_employee_documents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_employee_documents() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Insert a document record for each active document type
  INSERT INTO public.documents (
    employee_id,
    document_type_id,
    file_name,
    file_path,
    status,
    expiration_date
  )
  SELECT 
    NEW.id,
    dt.id,
    '',
    '',
    'pending'::document_status,
    CASE 
      WHEN dt.default_validity_years IS NOT NULL 
      THEN CURRENT_DATE + (dt.default_validity_years || ' years')::interval
      ELSE NULL
    END
  FROM public.document_types dt
  WHERE dt.is_active = true;
  
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;


--
-- Name: notify_document_approved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_document_approved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  employee_record RECORD;
  doc_type_name TEXT;
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Buscar informações do funcionário e tipo de documento
    SELECT e.full_name, e.user_id, dt.name
    INTO employee_record
    FROM employees e
    JOIN document_types dt ON dt.id = NEW.document_type_id
    WHERE e.id = NEW.employee_id;
    
    -- Notificar o funcionário se ele tiver acesso
    IF employee_record.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, message)
      VALUES (
        employee_record.user_id,
        'success',
        'Seu documento "' || employee_record.name || '" foi aprovado!'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: notify_document_rejected(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_document_rejected() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  employee_record RECORD;
  doc_type_name TEXT;
BEGIN
  IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    -- Buscar informações do funcionário e tipo de documento
    SELECT e.full_name, e.user_id, dt.name
    INTO employee_record
    FROM employees e
    JOIN document_types dt ON dt.id = NEW.document_type_id
    WHERE e.id = NEW.employee_id;
    
    -- Notificar o funcionário se ele tiver acesso
    IF employee_record.user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, message)
      VALUES (
        employee_record.user_id,
        'error',
        'Seu documento "' || employee_record.name || '" foi rejeitado. ' || COALESCE('Motivo: ' || NEW.observations, '')
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    user_id uuid,
    user_email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    cnpj text NOT NULL,
    logo_url text,
    notification_email text,
    theme_primary_color text DEFAULT '#000000'::text,
    auto_confirm_signups boolean DEFAULT true,
    expiration_alert_days integer DEFAULT 30,
    max_upload_size_mb integer DEFAULT 10,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    default_validity_years integer
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    document_type_id uuid,
    file_name text,
    file_path text,
    file_size integer,
    expiration_date date,
    status public.document_status DEFAULT 'pending'::public.document_status,
    uploaded_by uuid,
    validated_by uuid,
    validated_at timestamp with time zone,
    observations text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    rg text NOT NULL,
    cpf text NOT NULL,
    birth_date date,
    cep text,
    municipality text,
    neighborhood text,
    address text,
    phone text,
    mobile text,
    email text,
    "position" text NOT NULL,
    company_name text,
    company_cnpj text,
    is_owner boolean DEFAULT false,
    admission_date date,
    validation_date date,
    responsible_function text,
    status text DEFAULT 'ATIVO'::text,
    work_location text,
    observations text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_code_key UNIQUE (code);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: employees employees_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_cpf_key UNIQUE (cpf);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: documents on_document_rejected; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_document_rejected AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.notify_document_rejected();


--
-- Name: documents on_document_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_document_status_change AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.notify_document_approved();


--
-- Name: employees on_employee_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_employee_created AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.create_employee_documents();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: documents documents_document_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES public.document_types(id) ON DELETE RESTRICT;


--
-- Name: documents documents_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_validated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: documents Admins can delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete documents" ON public.documents FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: employees Admins can delete employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete employees" ON public.employees FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can insert documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert documents" ON public.documents FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: employees Admins can insert employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert employees" ON public.employees FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: company_settings Admins can manage company settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage company settings" ON public.company_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: document_types Admins can manage document types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage document types" ON public.document_types USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can update documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update documents" ON public.documents FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: employees Admins can update employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update employees" ON public.employees FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: documents Admins can view all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all documents" ON public.documents FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: employees Admins can view all employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all employees" ON public.employees FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_log Admins can view audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Bootstrap first admin role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Bootstrap first admin role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (((role = 'admin'::public.app_role) AND (( SELECT count(*) AS count
   FROM public.user_roles user_roles_1
  WHERE (user_roles_1.role = 'admin'::public.app_role)) = 0)));


--
-- Name: employees Employees can view their own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees can view their own data" ON public.employees FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: documents Employees can view their own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employees can view their own documents" ON public.documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.employees
  WHERE ((employees.id = documents.employee_id) AND (employees.user_id = auth.uid())))));


--
-- Name: company_settings Everyone can view company settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view company settings" ON public.company_settings FOR SELECT TO authenticated USING (true);


--
-- Name: document_types Everyone can view document types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view document types" ON public.document_types FOR SELECT USING (true);


--
-- Name: notifications System can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: audit_log System can insert audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert audit log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: document_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


