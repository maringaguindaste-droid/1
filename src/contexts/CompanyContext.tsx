import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  logo_url: string | null;
  is_active: boolean;
}

interface CompanyContextType {
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  userCompanies: Company[];
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [userCompanies, setUserCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (user && !authLoading) {
      fetchUserCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, authLoading]);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserCompanies = async () => {
    if (!user) return;

    try {
      if (isAdmin) {
        // Admins have access to all companies
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        setUserCompanies(data || []);
        
        // Auto-select first company if none selected (use functional update to avoid stale state)
        if (data && data.length > 0) {
          setSelectedCompany(prev => prev || data[0]);
        }
      } else {
        // Managers/Employees: Fetch ONLY user's associated companies
        const { data, error } = await supabase
          .from("user_companies")
          .select(`
            company_id,
            is_default,
            companies (*)
          `)
          .eq("user_id", user.id);

        if (error) throw error;

        const userComps = data?.map((uc: any) => uc.companies).filter(Boolean) || [];
        setUserCompanies(userComps);

        // Set default company for manager
        const defaultCompany = data?.find((uc: any) => uc.is_default)?.companies;
        if (defaultCompany) {
          setSelectedCompany(defaultCompany);
        } else if (userComps.length > 0) {
          setSelectedCompany(prev => prev || userComps[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching user companies:", error);
    }
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        selectedCompany,
        setSelectedCompany,
        userCompanies,
        loading,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error("useCompany must be used within a CompanyProvider");
  }
  return context;
}
