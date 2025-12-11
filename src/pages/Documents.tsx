import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Calendar, CheckCircle, XCircle, Clock, Download, AlertCircle, Plus, Trash2, Loader2, Upload, Eye, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentsByEmployee } from "@/components/DocumentsByEmployee";
import { DocumentPackScanner } from "@/components/DocumentPackScanner";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DocumentEditDialog } from "@/components/DocumentEditDialog";

interface Document {
  id: string;
  employee_id: string;
  file_name: string;
  file_path: string;
  document_type_id: string | null;
  expiration_date: string | null;
  observations: string | null;
  status: string;
  created_at: string;
  document_types: {
    name: string;
    code: string;
  } | null;
  employees: {
    full_name: string;
    company_id: string | null;
  } | null;
}

export default function Documents() {
  const { isAdmin, user } = useAuth();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDocForView, setSelectedDocForView] = useState<{ filePath: string; fileName: string } | null>(null);
  const [selectedDocForEdit, setSelectedDocForEdit] = useState<Document | null>(null);

  useEffect(() => {
    if (user) {
      fetchDocuments();
      fetchEmployees();
    }

    // Subscribe to realtime changes for documents
    const documentsChannel = supabase
      .channel('documents-realtime-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, (payload) => {
        console.log('Document change detected:', payload);
        fetchDocuments();
      })
      .subscribe();

    // Also listen for employee changes
    const employeesChannel = supabase
      .channel('documents-employees-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        console.log('Employee change detected, refreshing...');
        fetchEmployees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(documentsChannel);
      supabase.removeChannel(employeesChannel);
    };
  }, [user, selectedCompany]);

  useEffect(() => {
    let filtered = documents;

    // Filter by selected company
    if (selectedCompany) {
      filtered = filtered.filter(doc => doc.employees?.company_id === selectedCompany.id);
    }

    if (searchTerm) {
      filtered = filtered.filter(doc => 
        doc.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.employees?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.document_types?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(doc => doc.status === statusFilter);
    }

    if (employeeFilter !== "all") {
      filtered = filtered.filter(doc => doc.employee_id === employeeFilter);
    }

    setFilteredDocuments(filtered);
  }, [documents, searchTerm, statusFilter, employeeFilter, selectedCompany]);

  const fetchEmployees = async () => {
    let query = supabase
      .from("employees")
      .select("id, full_name, company_id")
      .eq("status", "ATIVO")
      .order("full_name");
    
    if (selectedCompany) {
      query = query.eq("company_id", selectedCompany.id);
    }
    
    const { data } = await query;
    if (data) setEmployees(data);
  };

  const fetchDocuments = async () => {
    try {
      // RLS will handle permissions - managers can see documents from their company
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          document_types (name, code),
          employees (full_name, company_id)
        `)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="w-4 h-4" />;
      case "pending": return <Clock className="w-4 h-4" />;
      case "rejected": return <XCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
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

  const handleValidateDocument = async (documentId: string, newStatus: "approved" | "rejected") => {
    try {
      setValidating(documentId);
      
      const { error } = await supabase
        .from("documents")
        .update({
          status: newStatus,
          validated_by: user?.id,
          validated_at: new Date().toISOString()
        })
        .eq("id", documentId);

      if (error) throw error;

      toast.success(`Documento ${newStatus === "approved" ? "aprovado" : "rejeitado"} com sucesso`);
      fetchDocuments();
    } catch (error: any) {
      toast.error("Erro ao validar documento");
      console.error(error);
    } finally {
      setValidating(null);
    }
  };

  const confirmDelete = (documentId: string) => {
    setDocumentToDelete(documentId);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentToDelete);

      if (error) throw error;

      toast.success("Documento excluído com sucesso");
      fetchDocuments();
    } catch (error: any) {
      toast.error("Erro ao excluir documento");
      console.error(error);
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const downloadDocument = async (filePath: string, fileName: string) => {
    if (!filePath || filePath.trim() === "") {
      toast.error("Documento sem arquivo para download");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "documento";
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (selectedEmployee) {
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            onClick={() => setSelectedEmployee(null)}
            className="mb-4"
          >
            ← Voltar para todos os documentos
          </Button>
        </div>
        <DocumentsByEmployee
          employeeId={selectedEmployee.id}
          employeeName={selectedEmployee.name}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Excluir Documento"
        description="Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita."
      />

      {selectedDocForView && (
        <DocumentViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          filePath={selectedDocForView.filePath}
          fileName={selectedDocForView.fileName}
        />
      )}

      <DocumentEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        document={selectedDocForEdit}
        onSave={fetchDocuments}
      />

      <DocumentPackScanner 
        open={scannerOpen} 
        onOpenChange={setScannerOpen}
        onComplete={() => fetchDocuments()}
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Documentos</h1>
          <p className="text-muted-foreground">
            Visualize e gerencie os documentos {isAdmin ? "de todos os funcionários" : "enviados"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importar Pack
            </Button>
            <Button onClick={() => navigate("/documents/new")}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Documento
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Buscar por tipo de documento, funcionário ou arquivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {/* Filtro por funcionário - disponível para admin e gerentes */}
        {employees.length > 0 && (
          <div className="w-64">
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por funcionário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funcionários</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
              <SelectItem value="expired">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{filteredDocuments.length} documento(s)</Badge>
      </div>

      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum documento encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">
                      {doc.document_types?.name || "Documento"}
                    </CardTitle>
                    {isAdmin && doc.employees && (
                      <Button
                        variant="link"
                        size="sm"
                        className="text-sm text-muted-foreground p-0 h-auto mt-1"
                        onClick={() => setSelectedEmployee({ 
                          id: doc.employee_id, 
                          name: doc.employees!.full_name 
                        })}
                      >
                        {doc.employees.full_name}
                      </Button>
                    )}
                  </div>
                  <Badge className={getStatusColor(doc.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(doc.status)}
                      {getStatusLabel(doc.status)}
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate text-muted-foreground">{doc.file_name}</span>
                </div>
                
                {doc.expiration_date && (
                  <div className={`flex items-center gap-2 text-sm ${
                    isExpiringSoon(doc.expiration_date) ? "text-warning font-medium" : "text-muted-foreground"
                  }`}>
                    <Calendar className="w-4 h-4" />
                    <span>Validade: {formatDate(doc.expiration_date)}</span>
                    {isExpiringSoon(doc.expiration_date) && (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                )}

                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Enviado em {formatDate(doc.created_at)}
                  </p>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2">
                    {doc.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleValidateDocument(doc.id, "approved")}
                          disabled={validating === doc.id}
                        >
                          {validating === doc.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Aprovar
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleValidateDocument(doc.id, "rejected")}
                          disabled={validating === doc.id}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Rejeitar
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedDocForView({ filePath: doc.file_path, fileName: doc.file_name });
                        setViewerOpen(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedDocForEdit(doc);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => confirmDelete(doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {!isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Baixar Documento
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
