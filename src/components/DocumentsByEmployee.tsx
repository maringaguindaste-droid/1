import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, Download, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface DocumentsByEmployeeProps {
  employeeId: string;
  employeeName: string;
}

export const DocumentsByEmployee = ({ employeeId, employeeName }: DocumentsByEmployeeProps) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();

    const channel = supabase
      .channel(`documents-employee-${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `employee_id=eq.${employeeId}`
        },
        () => {
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId]);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          document_types (name, code)
        `)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-success";
      case "pending": return "bg-warning";
      case "rejected": return "bg-destructive";
      case "expired": return "bg-muted";
      default: return "bg-secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Rejeitado",
      expired: "Vencido",
    };
    return labels[status] || status;
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expirationDate = new Date(date);
    const today = new Date();
    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration <= 30 && daysUntilExpiration > 0;
  };

  const downloadDocument = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Download iniciado");
    } catch (error: any) {
      toast.error("Erro ao baixar documento");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Carregando documentos...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos de {employeeName}</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum documento encontrado</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        <h4 className="font-semibold">
                          {doc.document_types?.code} - {doc.document_types?.name}
                        </h4>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <p><strong>Arquivo:</strong> {doc.file_name}</p>
                        {doc.expiration_date && (
                          <div className={`flex items-center gap-2 ${
                            isExpiringSoon(doc.expiration_date) ? "text-warning font-medium" : ""
                          }`}>
                            <Calendar className="w-4 h-4" />
                            <span>Vencimento: {formatDate(doc.expiration_date)}</span>
                            {isExpiringSoon(doc.expiration_date) && (
                              <AlertCircle className="w-4 h-4" />
                            )}
                          </div>
                        )}
                        <p>Enviado em: {formatDate(doc.created_at)}</p>
                        {doc.observations && (
                          <p className="mt-2"><strong>Obs:</strong> {doc.observations}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge className={getStatusColor(doc.status)}>
                        {getStatusLabel(doc.status)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Baixar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
