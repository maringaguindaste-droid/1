import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Eye, UserX, FileText, Building2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Employee {
  id: string;
  full_name: string;
  cpf: string;
  rg: string;
  position: string;
  status: string;
  admission_date: string | null;
  validation_date: string | null;
  company_id: string | null;
  email: string | null;
  phone: string | null;
}

export default function Employees() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchEmployees();

    // Subscribe to realtime changes for employees
    const employeesChannel = supabase
      .channel('employees-realtime-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, (payload) => {
        console.log('Employee change detected:', payload);
        fetchEmployees();
      })
      .subscribe();

    // Also listen for document changes to update counts
    const documentsChannel = supabase
      .channel('employees-documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        console.log('Document change detected, refreshing employee list...');
        fetchEmployees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(employeesChannel);
      supabase.removeChannel(documentsChannel);
    };
  }, [selectedCompany]);

  useEffect(() => {
    let filtered = employees;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter((employee) =>
        employee.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.cpf.includes(searchTerm) ||
        employee.rg.includes(searchTerm)
      );
    }

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((employee) => employee.status === statusFilter);
    }

    setFilteredEmployees(filtered);
  }, [searchTerm, employees, statusFilter]);

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from("employees")
        .select("*")
        .order("full_name");

      // Filter by selected company if available
      if (selectedCompany) {
        query = query.eq("company_id", selectedCompany.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmployees(data || []);
      setFilteredEmployees(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar funcionarios");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTerminate = async (employeeId: string, employeeName: string) => {
    try {
      const { error } = await supabase
        .from("employees")
        .update({ status: "DEMITIDO" })
        .eq("id", employeeId);

      if (error) throw error;

      toast.success(`Funcionario ${employeeName} marcado como demitido`);
      fetchEmployees();
    } catch (error: any) {
      toast.error("Erro ao demitir funcionario");
      console.error(error);
    }
  };

  const handleDeletePermanent = async () => {
    if (!employeeToDelete) return;
    
    setDeleting(true);
    try {
      // First delete all documents for this employee
      const { error: docsError } = await supabase
        .from("documents")
        .delete()
        .eq("employee_id", employeeToDelete.id);
      
      if (docsError) throw docsError;

      // Then delete the employee
      const { error: empError } = await supabase
        .from("employees")
        .delete()
        .eq("id", employeeToDelete.id);

      if (empError) throw empError;

      toast.success(`Funcionário ${employeeToDelete.name} excluído permanentemente`);
      fetchEmployees();
    } catch (error: any) {
      toast.error("Erro ao excluir funcionário: " + error.message);
      console.error(error);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    }
  };

  const confirmDeletePermanent = (employee: { id: string; full_name: string }) => {
    setEmployeeToDelete({ id: employee.id, name: employee.full_name });
    setDeleteDialogOpen(true);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ATIVO":
        return <Badge className="bg-success text-success-foreground">Ativo</Badge>;
      case "INATIVO":
        return <Badge variant="secondary">Inativo</Badge>;
      case "DEMITIDO":
        return <Badge variant="destructive">Demitido</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const stats = {
    total: employees.length,
    ativos: employees.filter(e => e.status === "ATIVO").length,
    inativos: employees.filter(e => e.status === "INATIVO").length,
    demitidos: employees.filter(e => e.status === "DEMITIDO").length,
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

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeletePermanent}
        title="Excluir Funcionário Permanentemente"
        description={`ATENÇÃO: Tem certeza que deseja EXCLUIR PERMANENTEMENTE ${employeeToDelete?.name}? 
        
Esta ação irá remover o funcionário E TODOS OS SEUS DOCUMENTOS do sistema. Esta ação NÃO PODE ser desfeita!`}
      />
      
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Funcionarios</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            {selectedCompany && (
              <>
                <Building2 className="w-4 h-4" />
                {selectedCompany.name}
              </>
            )}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/employees/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Funcionario
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-success transition-colors" onClick={() => setStatusFilter("ATIVO")}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-success">{stats.ativos}</p>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-muted-foreground transition-colors" onClick={() => setStatusFilter("INATIVO")}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats.inativos}</p>
            <p className="text-xs text-muted-foreground">Inativos</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-destructive transition-colors" onClick={() => setStatusFilter("DEMITIDO")}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-destructive">{stats.demitidos}</p>
            <p className="text-xs text-muted-foreground">Demitidos</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou RG..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          {filteredEmployees.length} funcionario(s)
        </Badge>
        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")}>
            Limpar filtro
          </Button>
        )}
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nome</TableHead>
              <TableHead>RG</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Admissao</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum funcionario encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((employee) => (
                <TableRow key={employee.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{employee.full_name}</TableCell>
                  <TableCell>{employee.rg}</TableCell>
                  <TableCell>{employee.cpf}</TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell>{formatDate(employee.admission_date)}</TableCell>
                  <TableCell>{getStatusBadge(employee.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/employees/${employee.id}/view`)}
                        title="Ver detalhes e documentos"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/employees/${employee.id}`)}
                            title="Editar funcionário"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          {employee.status !== "DEMITIDO" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  title="Demitir"
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Confirmar demissao</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja marcar {employee.full_name} como demitido?
                                    Os documentos serao mantidos para historico.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleTerminate(employee.id, employee.full_name)}
                                            className="bg-destructive hover:bg-destructive/90"
                                          >
                                            Confirmar Demissão
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => confirmDeletePermanent(employee)}
                                    title="Excluir permanentemente"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        }
