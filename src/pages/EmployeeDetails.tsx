import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  ArrowLeft, 
  User, 
  FileText, 
  Calendar, 
  Phone, 
  Mail, 
  MapPin,
  Briefcase,
  Download,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  UserX,
  Edit,
  Trash2,
  Eye
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentViewer } from "@/components/DocumentViewer";
import { DocumentEditDialog } from "@/components/DocumentEditDialog";

interface Employee {
  id: string;
  full_name: string;
  cpf: string;
  rg: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  neighborhood: string | null;
  municipality: string | null;
  cep: string | null;
  position: string;
  admission_date: string | null;
  birth_date: string | null;
  status: string;
  company_id: string | null;
  company_name: string | null;
  observations: string | null;
}

interface Document {
  id: string;
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
}

export default function EmployeeDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { selectedCompany } = useCompany();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [deletingDocs, setDeletingDocs] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDocForView, setSelectedDocForView] = useState<{ filePath: string; fileName: string } | null>(null);
  const [selectedDocForEdit, setSelectedDocForEdit] = useState<Document | null>(null);

  useEffect(() => {
    if (id) {
      fetchEmployee();
      fetchDocuments();
    }

    // Subscribe to realtime changes for this employee's documents
    const documentsChannel = supabase
      .channel(`employee-${id}-documents-realtime`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'documents',
        filter: `employee_id=eq.${id}`
      }, (payload) => {
        console.log('Document change for employee:', payload);
        fetchDocuments();
      })
      .subscribe();

    // Subscribe to realtime changes for this employee
    const employeeChannel = supabase
      .channel(`employee-${id}-realtime`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'employees',
        filter: `id=eq.${id}`
      }, (payload) => {
        console.log('Employee change:', payload);
        fetchEmployee();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(documentsChannel);
      supabase.removeChannel(employeeChannel);
    };
  }, [id]);

  const fetchEmployee = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setEmployee(data);
    } catch (error: any) {
      toast.error("Erro ao carregar funcionário");
      console.error(error);
      navigate("/employees");
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      // Fetch all documents for this employee - RLS will handle permissions
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          document_types (name, code)
        `)
        .eq("employee_id", id)
        .order("document_types(code)", { ascending: true });

      if (error) throw error;
      
      // Sort by document type name for better organization
      const sortedDocs = (data || []).sort((a, b) => {
        const nameA = a.document_types?.name || "";
        const nameB = b.document_types?.name || "";
        return nameA.localeCompare(nameB);
      });
      
      setDocuments(sortedDocs);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos");
      console.error(error);
    }
  };

  const handleTerminate = async () => {
    if (!employee) return;

    try {
      const { error } = await supabase
        .from("employees")
        .update({ status: "DEMITIDO" })
        .eq("id", employee.id);

      if (error) throw error;

      toast.success("Funcionário demitido com sucesso");
      setEmployee({ ...employee, status: "DEMITIDO" });
      setTerminateDialogOpen(false);
    } catch (error: any) {
      toast.error("Erro ao demitir funcionário");
      console.error(error);
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

  const handleDeleteDocument = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    try {
      setDeletingDocs(true);
      
      // Delete from storage if file exists
      if (doc.file_path) {
        await supabase.storage.from('employee-documents').remove([doc.file_path]);
      }
      
      // Delete from database
      const { error } = await supabase.from('documents').delete().eq('id', docId);
      if (error) throw error;

      toast.success("Documento excluído com sucesso");
      setDocToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error("Erro ao excluir documento");
      console.error(error);
    } finally {
      setDeletingDocs(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedDocs.length === 0) return;

    try {
      setDeletingDocs(true);
      
      for (const docId of selectedDocs) {
        const doc = documents.find(d => d.id === docId);
        if (doc?.file_path) {
          await supabase.storage.from('employee-documents').remove([doc.file_path]);
        }
        await supabase.from('documents').delete().eq('id', docId);
      }

      toast.success(`${selectedDocs.length} documento(s) excluído(s)`);
      setSelectedDocs([]);
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error("Erro ao excluir documentos");
      console.error(error);
    } finally {
      setDeletingDocs(false);
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) 
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleAllDocs = () => {
    if (selectedDocs.length === documents.length) {
      setSelectedDocs([]);
    } else {
      setSelectedDocs(documents.map(d => d.id));
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      ATIVO: { label: "Ativo", variant: "default" },
      INATIVO: { label: "Inativo", variant: "secondary" },
      DEMITIDO: { label: "Demitido", variant: "destructive" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDocStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      pending: { label: "Pendente", className: "bg-warning", icon: <Clock className="w-3 h-3" /> },
      approved: { label: "Aprovado", className: "bg-success", icon: <CheckCircle className="w-3 h-3" /> },
      rejected: { label: "Rejeitado", className: "bg-destructive", icon: <XCircle className="w-3 h-3" /> },
      expired: { label: "Vencido", className: "bg-muted", icon: <AlertTriangle className="w-3 h-3" /> },
    };
    const config = statusConfig[status] || { label: status, className: "bg-secondary", icon: null };
    return (
      <Badge className={config.className}>
        <span className="flex items-center gap-1">
          {config.icon}
          {config.label}
        </span>
      </Badge>
    );
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expirationDate = new Date(date);
    const today = new Date();
    const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration <= 30 && daysUntilExpiration > 0;
  };

  const isExpired = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const documentStats = {
    total: documents.length,
    approved: documents.filter(d => d.status === "approved").length,
    pending: documents.filter(d => d.status === "pending").length,
    expired: documents.filter(d => d.status === "expired").length,
    rejected: documents.filter(d => d.status === "rejected").length,
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

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Funcionário não encontrado</p>
        <Button variant="link" onClick={() => navigate("/employees")}>
          Voltar para lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={terminateDialogOpen}
        onOpenChange={setTerminateDialogOpen}
        onConfirm={handleTerminate}
        title="Demitir Funcionário"
        description={`Tem certeza que deseja demitir ${employee.full_name}? Esta ação irá inativar o acesso do funcionário ao sistema.`}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={() => {
          if (docToDelete) {
            handleDeleteDocument(docToDelete);
          } else if (selectedDocs.length > 0) {
            handleDeleteSelected();
          }
        }}
        title="Excluir Documento(s)"
        description={docToDelete 
          ? "Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita."
          : `Tem certeza que deseja excluir ${selectedDocs.length} documento(s)? Esta ação não pode ser desfeita.`
        }
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

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/employees")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => navigate(`/employees/${employee.id}`)}>
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
              {employee.status !== "DEMITIDO" && (
                <Button variant="destructive" onClick={() => setTerminateDialogOpen(true)}>
                  <UserX className="w-4 h-4 mr-2" />
                  Demitir
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Employee Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{employee.full_name}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Briefcase className="w-4 h-4" />
                  {employee.position}
                </CardDescription>
              </div>
            </div>
            {getStatusBadge(employee.status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Dados Pessoais
              </h4>
              <div className="space-y-2">
                <p className="text-sm"><strong>CPF:</strong> {employee.cpf}</p>
                <p className="text-sm"><strong>RG:</strong> {employee.rg}</p>
                <p className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <strong>Nascimento:</strong> {formatDate(employee.birth_date)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Contato
              </h4>
              <div className="space-y-2">
                {employee.email && (
                  <p className="text-sm flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    {employee.email}
                  </p>
                )}
                {employee.phone && (
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    {employee.phone}
                  </p>
                )}
                {employee.mobile && (
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    {employee.mobile}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Endereço
              </h4>
              <div className="space-y-2">
                {employee.address && (
                  <p className="text-sm flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <span>
                      {employee.address}
                      {employee.neighborhood && `, ${employee.neighborhood}`}
                      {employee.municipality && ` - ${employee.municipality}`}
                      {employee.cep && ` (${employee.cep})`}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Empresa
              </h4>
              <div className="space-y-2">
                <p className="text-sm"><strong>Empresa:</strong> {employee.company_name || "-"}</p>
                <p className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <strong>Admissão:</strong> {formatDate(employee.admission_date)}
                </p>
              </div>
            </div>
          </div>

          {employee.observations && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-2">
                Observações
              </h4>
              <p className="text-sm text-muted-foreground">{employee.observations}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{documentStats.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-success/30 bg-success/5">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-success">{documentStats.approved}</p>
              <p className="text-sm text-muted-foreground">Aprovados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-warning">{documentStats.pending}</p>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-destructive">{documentStats.rejected}</p>
              <p className="text-sm text-muted-foreground">Rejeitados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-muted">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-muted-foreground">{documentStats.expired}</p>
              <p className="text-sm text-muted-foreground">Vencidos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documentos
            </CardTitle>
            <CardDescription>
              Lista de documentos do funcionário
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isAdmin && selectedDocs.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => {
                  setDocToDelete(null);
                  setDeleteDialogOpen(true);
                }}
                disabled={deletingDocs}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir ({selectedDocs.length})
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => navigate(`/documents/new?employeeId=${employee.id}`)}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Documento
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum documento cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={selectedDocs.length === documents.length && documents.length > 0}
                          onCheckedChange={toggleAllDocs}
                        />
                      </TableHead>
                    )}
                    <TableHead>Tipo</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className={selectedDocs.includes(doc.id) ? 'bg-muted/50' : ''}>
                      {isAdmin && (
                        <TableCell>
                          <Checkbox 
                            checked={selectedDocs.includes(doc.id)}
                            onCheckedChange={() => toggleDocSelection(doc.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {doc.document_types?.name || "Documento"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.file_name || "-"}
                      </TableCell>
                      <TableCell>
                        <span className={`${
                          isExpired(doc.expiration_date) 
                            ? "text-destructive font-medium" 
                            : isExpiringSoon(doc.expiration_date) 
                              ? "text-warning font-medium" 
                              : "text-muted-foreground"
                        }`}>
                          {formatDate(doc.expiration_date)}
                          {isExpiringSoon(doc.expiration_date) && (
                            <AlertTriangle className="w-4 h-4 inline ml-1" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {getDocStatusBadge(doc.status)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(doc.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDocForView({ filePath: doc.file_path, fileName: doc.file_name });
                              setViewerOpen(true);
                            }}
                            disabled={!doc.file_path}
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                            disabled={!doc.file_path}
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedDocForEdit(doc);
                                  setEditDialogOpen(true);
                                }}
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setDocToDelete(doc.id);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
