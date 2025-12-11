import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Calendar, User, FileText, ExternalLink } from "lucide-react";

interface ExpiringDocument {
  id: string;
  expiration_date: string;
  file_name: string;
  status: string;
  employee_id: string;
  document_types: { name: string; code: string } | null;
  employees: { full_name: string; company_id: string } | null;
}

interface ExpiringDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter?: 'all' | '7days' | '15days' | '30days' | 'expired';
}

export function ExpiringDocumentsDialog({ open, onOpenChange, filter = 'all' }: ExpiringDocumentsDialogProps) {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const [documents, setDocuments] = useState<ExpiringDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(filter);

  useEffect(() => {
    if (open) {
      fetchDocuments();
      setActiveTab(filter);
    }
  }, [open, selectedCompany, filter]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("documents")
        .select(`
          id, expiration_date, file_name, status, employee_id,
          document_types (name, code),
          employees (full_name, company_id)
        `)
        .not("expiration_date", "is", null)
        .lte("expiration_date", thirtyDaysLater.toISOString())
        .order("expiration_date", { ascending: true });

      if (error) throw error;

      // Filter by company if selected
      let filtered = data || [];
      if (selectedCompany) {
        filtered = filtered.filter(doc => doc.employees?.company_id === selectedCompany.id);
      }

      setDocuments(filtered);
    } catch (error) {
      console.error("Error fetching expiring documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntilExpiration = (date: string) => {
    return differenceInDays(new Date(date), new Date());
  };

  const getUrgencyBadge = (days: number) => {
    if (days < 0) {
      return <Badge className="bg-destructive">Vencido há {Math.abs(days)} dias</Badge>;
    }
    if (days === 0) {
      return <Badge className="bg-destructive">Vence hoje!</Badge>;
    }
    if (days <= 7) {
      return <Badge className="bg-destructive">{days} dias</Badge>;
    }
    if (days <= 15) {
      return <Badge className="bg-warning">{days} dias</Badge>;
    }
    return <Badge className="bg-warning/70">{days} dias</Badge>;
  };

  const filterDocuments = (docs: ExpiringDocument[], tab: string) => {
    const today = new Date();
    return docs.filter(doc => {
      const days = getDaysUntilExpiration(doc.expiration_date);
      switch (tab) {
        case 'expired':
          return days < 0;
        case '7days':
          return days >= 0 && days <= 7;
        case '15days':
          return days >= 0 && days <= 15;
        case '30days':
          return days >= 0 && days <= 30;
        default:
          return true;
      }
    });
  };

  const getCounts = () => {
    const expired = documents.filter(d => getDaysUntilExpiration(d.expiration_date) < 0).length;
    const sevenDays = documents.filter(d => {
      const days = getDaysUntilExpiration(d.expiration_date);
      return days >= 0 && days <= 7;
    }).length;
    const fifteenDays = documents.filter(d => {
      const days = getDaysUntilExpiration(d.expiration_date);
      return days >= 0 && days <= 15;
    }).length;
    const thirtyDays = documents.filter(d => {
      const days = getDaysUntilExpiration(d.expiration_date);
      return days >= 0 && days <= 30;
    }).length;
    
    return { expired, sevenDays, fifteenDays, thirtyDays, all: documents.length };
  };

  const counts = getCounts();
  const filteredDocs = filterDocuments(documents, activeTab);

  const handleViewEmployee = (employeeId: string) => {
    onOpenChange(false);
    navigate(`/employees/details/${employeeId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            Documentos com Vencimento Próximo
          </DialogTitle>
          <DialogDescription>
            Documentos que requerem atenção por vencimento próximo ou já vencidos
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="all" className="text-xs">
              Todos ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="expired" className="text-xs">
              Vencidos ({counts.expired})
            </TabsTrigger>
            <TabsTrigger value="7days" className="text-xs">
              7 dias ({counts.sevenDays})
            </TabsTrigger>
            <TabsTrigger value="15days" className="text-xs">
              15 dias ({counts.fifteenDays})
            </TabsTrigger>
            <TabsTrigger value="30days" className="text-xs">
              30 dias ({counts.thirtyDays})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum documento encontrado nesta categoria</p>
              </div>
            ) : (
              <ScrollArea className="h-[50vh]">
                <div className="space-y-2 pr-4">
                  {filteredDocs.map((doc) => {
                    const days = getDaysUntilExpiration(doc.expiration_date);
                    return (
                      <div
                        key={doc.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          days < 0 
                            ? 'bg-destructive/10 border-destructive/30' 
                            : days <= 7 
                            ? 'bg-destructive/5 border-destructive/20'
                            : 'bg-warning/5 border-warning/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">
                                {doc.document_types?.name || 'Documento'}
                              </span>
                              {getUrgencyBadge(days)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <User className="w-3 h-3" />
                              <span className="truncate">{doc.employees?.full_name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                Vencimento: {format(new Date(doc.expiration_date), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewEmployee(doc.employee_id)}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
