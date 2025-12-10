import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DashboardStats } from "@/components/DashboardStats";
import { ExpiringDocumentsDialog } from "@/components/ExpiringDocumentsDialog";

interface DashboardStatsData {
  totalEmployees: number;
  totalDocuments: number;
  pendingDocuments: number;
  approvedDocuments: number;
  rejectedDocuments: number;
  expiredDocuments: number;
  expiringSoon: number;
}

export default function Dashboard() {
  const { isAdmin, user } = useAuth();
  const { selectedCompany } = useCompany();
  const [stats, setStats] = useState<DashboardStatsData>({
    totalEmployees: 0,
    totalDocuments: 0,
    pendingDocuments: 0,
    approvedDocuments: 0,
    rejectedDocuments: 0,
    expiredDocuments: 0,
    expiringSoon: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expiringDialogOpen, setExpiringDialogOpen] = useState(false);
  const [expiringFilter, setExpiringFilter] = useState<'all' | '7days' | '15days' | '30days' | 'expired'>('all');

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }

    // Subscribe to realtime changes for dashboard stats
    const employeesChannel = supabase
      .channel('dashboard-employees-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        console.log('Employee change detected, refreshing dashboard...');
        fetchDashboardData();
      })
      .subscribe();

    const documentsChannel = supabase
      .channel('dashboard-documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        console.log('Document change detected, refreshing dashboard...');
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(employeesChannel);
      supabase.removeChannel(documentsChannel);
    };
  }, [user, selectedCompany]);

  const fetchDashboardData = async () => {
    try {
      // Both admin and managers can see company data via RLS
      // Build queries - RLS will filter to user's accessible data
      let employeesQuery = supabase.from("employees").select("id", { count: "exact", head: true });
      
      // For documents, we need to handle the join properly
      const { count: totalDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true });
      
      const { count: pendingDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
        
      const { count: approvedDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved");
        
      const { count: rejectedDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected");
        
      const { count: expiredDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired");
        
      const { count: expiringDocs } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .gte("expiration_date", new Date().toISOString())
        .lte("expiration_date", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
        .neq("status", "expired");

      // Get employees count - filter by selected company if set
      if (selectedCompany) {
        employeesQuery = employeesQuery.eq("company_id", selectedCompany.id);
      }
      
      const { count: employeesCount } = await employeesQuery;

      setStats({
        totalEmployees: employeesCount || 0,
        totalDocuments: totalDocs || 0,
        pendingDocuments: pendingDocs || 0,
        approvedDocuments: approvedDocs || 0,
        rejectedDocuments: rejectedDocs || 0,
        expiredDocuments: expiredDocs || 0,
        expiringSoon: expiringDocs || 0,
      });
    } catch (error: any) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const openExpiringDialog = (filter: 'all' | '7days' | '15days' | '30days' | 'expired') => {
    setExpiringFilter(filter);
    setExpiringDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <ExpiringDocumentsDialog 
        open={expiringDialogOpen} 
        onOpenChange={setExpiringDialogOpen}
        filter={expiringFilter}
      />

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema {isAdmin ? "- Administrador" : "- Gerente"}
          {selectedCompany && ` • ${selectedCompany.name}`}
        </p>
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStats
          title="Total de Funcionários"
          value={stats.totalEmployees}
          icon={Users}
          variant="default"
        />

        <DashboardStats
          title="Total de Documentos"
          value={stats.totalDocuments}
          icon={FileText}
          variant="default"
        />

        <DashboardStats
          title="Aprovados"
          value={stats.approvedDocuments}
          icon={CheckCircle}
          variant="default"
          description="Documentos válidos"
        />

        <DashboardStats
          title="Pendentes"
          value={stats.pendingDocuments}
          icon={Clock}
          variant="warning"
          description="Aguardando aprovação"
        />
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardStats
          title="Rejeitados"
          value={stats.rejectedDocuments}
          icon={XCircle}
          variant="destructive"
          description="Precisam correção"
        />

        <div 
          onClick={() => openExpiringDialog('expired')}
          className="cursor-pointer transition-transform hover:scale-[1.02]"
        >
          <DashboardStats
            title="Vencidos"
            value={stats.expiredDocuments}
            icon={AlertCircle}
            variant="destructive"
            description="Clique para ver detalhes"
          />
        </div>

        <div 
          onClick={() => openExpiringDialog('30days')}
          className="cursor-pointer transition-transform hover:scale-[1.02]"
        >
          <DashboardStats
            title="Vencendo em 30 dias"
            value={stats.expiringSoon}
            icon={AlertCircle}
            variant="warning"
            description="Clique para ver detalhes"
          />
        </div>
      </div>

      {(stats.expiringSoon > 0 || stats.expiredDocuments > 0) && (
        <Card 
          className="bg-warning/10 border-warning cursor-pointer hover:bg-warning/15 transition-colors"
          onClick={() => openExpiringDialog('all')}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  Atenção: Documentos requerem ação
                </h3>
                <p className="text-sm text-muted-foreground">
                  {stats.expiredDocuments > 0 && (
                    <span className="block">🚨 {stats.expiredDocuments} documento(s) vencido(s).</span>
                  )}
                  {stats.expiringSoon > 0 && (
                    <span className="block">⚠️ {stats.expiringSoon} documento(s) vencendo nos próximos 30 dias.</span>
                  )}
                  <span className="block text-primary mt-1">Clique para ver detalhes</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
