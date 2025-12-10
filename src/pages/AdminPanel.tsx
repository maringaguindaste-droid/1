import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Shield, UserPlus, Trash2, Settings, Users, Building2, RefreshCw, AlertTriangle, Edit } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  role?: string;
  companies?: string[];
  companyIds?: string[];
}

interface Company {
  id: string;
  name: string;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [checkingNotifications, setCheckingNotifications] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    totalEmployees: 0,
    expiringDocuments: 0,
  });

  useEffect(() => {
    fetchData();

    // Subscribe to realtime changes for all relevant tables
    const profilesChannel = supabase
      .channel('admin-profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        console.log('Profiles changed, refetching...');
        fetchData();
      })
      .subscribe();

    const rolesChannel = supabase
      .channel('admin-roles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        console.log('Roles changed, refetching...');
        fetchData();
      })
      .subscribe();

    const companiesChannel = supabase
      .channel('admin-companies-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_companies' }, () => {
        console.log('User companies changed, refetching...');
        fetchData();
      })
      .subscribe();

    const employeesChannel = supabase
      .channel('admin-employees-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        console.log('Employees changed, refetching...');
        fetchStats();
      })
      .subscribe();

    const documentsChannel = supabase
      .channel('admin-documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        console.log('Documents changed, refetching...');
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(rolesChannel);
      supabase.removeChannel(companiesChannel);
      supabase.removeChannel(employeesChannel);
      supabase.removeChannel(documentsChannel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchCompanies(), fetchStats()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .maybeSingle();

          const { data: userCompanies } = await supabase
            .from("user_companies")
            .select("company_id, companies(name)")
            .eq("user_id", profile.id);

          return {
            ...profile,
            role: roleData?.role || "sem_role",
            companies: userCompanies?.map((uc: any) => uc.companies?.name).filter(Boolean) || [],
            companyIds: userCompanies?.map((uc: any) => uc.company_id).filter(Boolean) || [],
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuarios");
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const fetchStats = async () => {
    try {
      // Count expiring documents (next 10 days)
      const tenDaysFromNow = new Date();
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

      const { count: expiringCount } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .lte("expiration_date", tenDaysFromNow.toISOString().split("T")[0])
        .gte("expiration_date", new Date().toISOString().split("T")[0])
        .neq("status", "expired");

      setStats(prev => ({
        ...prev,
        expiringDocuments: expiringCount || 0,
      }));
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreatingUser(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;
    const role = formData.get("role") as "admin" | "employee";

    if (selectedCompanies.length === 0) {
      toast.error("Selecione pelo menos uma empresa");
      setIsCreatingUser(false);
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Add role
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: authData.user.id, role });

        if (roleError) throw roleError;

        // Add company associations
        const companyInserts = selectedCompanies.map((companyId, index) => ({
          user_id: authData.user!.id,
          company_id: companyId,
          is_default: index === 0,
        }));

        const { error: companyError } = await supabase
          .from("user_companies")
          .insert(companyInserts);

        if (companyError) throw companyError;

        toast.success("Usuario criado com sucesso!");
        (e.target as HTMLFormElement).reset();
        setSelectedCompanies([]);
        fetchUsers();
      }
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Erro ao criar usuario");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    try {
      // Delete user companies first
      const { error: companyError } = await supabase
        .from("user_companies")
        .delete()
        .eq("user_id", userId);
      
      if (companyError) {
        console.error("Error deleting user companies:", companyError);
      }
      
      // Delete role
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
        
      if (roleError) {
        console.error("Error deleting user role:", roleError);
      }
      
      // Delete profile
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);
        
      if (profileError) {
        console.error("Error deleting profile:", profileError);
        throw profileError;
      }
      
      toast.success(`Usuario ${userEmail} removido com sucesso!`);
      
      // Refresh immediately
      await fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error("Erro ao excluir usuario: " + (error.message || "Erro desconhecido"));
    }
  };

  const handleChangeRole = async (userId: string, newRole: "admin" | "employee") => {
    try {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });

      if (error) throw error;

      toast.success("Permissao atualizada!");
      fetchUsers();
    } catch (error: any) {
      console.error("Error changing role:", error);
      toast.error("Erro ao alterar permissao");
    }
  };

  const handleEditCompanies = (user: User) => {
    setEditingUser(user);
    setEditCompanies(user.companyIds || []);
  };

  const handleSaveCompanies = async () => {
    if (!editingUser) return;

    try {
      // Delete existing company associations
      await supabase
        .from("user_companies")
        .delete()
        .eq("user_id", editingUser.id);

      // Insert new associations
      if (editCompanies.length > 0) {
        const companyInserts = editCompanies.map((companyId, index) => ({
          user_id: editingUser.id,
          company_id: companyId,
          is_default: index === 0,
        }));

        const { error } = await supabase
          .from("user_companies")
          .insert(companyInserts);

        if (error) throw error;
      }

      toast.success("Empresas atualizadas com sucesso!");
      setEditingUser(null);
      setEditCompanies([]);
      await fetchUsers();
    } catch (error: any) {
      console.error("Error updating companies:", error);
      toast.error("Erro ao atualizar empresas");
    }
  };

  const handleCheckNotifications = async () => {
    setCheckingNotifications(true);
    try {
      const { error } = await supabase.functions.invoke("check-expiring-documents");
      
      if (error) throw error;
      
      toast.success("Verificacao de documentos executada!");
    } catch (error: any) {
      console.error("Error checking notifications:", error);
      toast.error("Erro ao verificar documentos");
    } finally {
      setCheckingNotifications(false);
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

  return (
    <div className="space-y-6">
      {/* Edit Companies Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresas - {editingUser?.full_name || editingUser?.email}</DialogTitle>
            <DialogDescription>
              Selecione as empresas que este usuário terá acesso
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {companies.map((company) => (
              <div key={company.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50">
                <Checkbox
                  id={`edit-company-${company.id}`}
                  checked={editCompanies.includes(company.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setEditCompanies([...editCompanies, company.id]);
                    } else {
                      setEditCompanies(editCompanies.filter(c => c !== company.id));
                    }
                  }}
                />
                <Label 
                  htmlFor={`edit-company-${company.id}`}
                  className="flex-1 cursor-pointer"
                >
                  {company.name}
                </Label>
              </div>
            ))}
            {editCompanies.length === 0 && (
              <p className="text-sm text-warning">⚠️ Selecione pelo menos uma empresa</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveCompanies}
              disabled={editCompanies.length === 0}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Painel de Administracao
          </h1>
          <p className="text-muted-foreground">
            Gerencie usuarios, permissoes e configuracoes
          </p>
        </div>
        <Button 
          onClick={handleCheckNotifications} 
          disabled={checkingNotifications}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${checkingNotifications ? 'animate-spin' : ''}`} />
          Verificar Vencimentos
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">Total Usuarios</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users.filter(u => u.role === "admin").length}</p>
                <p className="text-xs text-muted-foreground">Administradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{companies.length}</p>
                <p className="text-xs text-muted-foreground">Empresas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.expiringDocuments > 0 ? "border-warning" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-8 h-8 ${stats.expiringDocuments > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-2xl font-bold">{stats.expiringDocuments}</p>
                <p className="text-xs text-muted-foreground">Docs Vencendo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="create">Criar Usuario</TabsTrigger>
          <TabsTrigger value="settings">Configuracoes</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Gerenciar Usuarios ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Empresas</TableHead>
                      <TableHead>Permissao</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum usuario encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.full_name || "-"}</TableCell>
                          <TableCell className="text-sm">{user.email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.companies && user.companies.length > 0 ? (
                                user.companies.map((company, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {company}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">Nenhuma</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.role || "sem_role"}
                              onValueChange={(value) => {
                                if (value !== "sem_role") {
                                  handleChangeRole(user.id, value as "admin" | "employee");
                                }
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <Badge className="bg-primary">Admin</Badge>
                                </SelectItem>
                                <SelectItem value="employee">
                                  <Badge variant="secondary">Funcionario</Badge>
                                </SelectItem>
                                {user.role === "sem_role" && (
                                  <SelectItem value="sem_role" disabled>
                                    <Badge variant="outline">Sem permissao</Badge>
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(user.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditCompanies(user)}
                                title="Editar empresas"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o usuario {user.full_name || user.email}?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteUser(user.id, user.email)}
                                      className="bg-destructive hover:bg-destructive/90"
                                    >
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Criar Novo Usuario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo *</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Nome completo"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Minimo 6 caracteres"
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Tipo de Usuario *</Label>
                  <Select name="role" defaultValue="employee" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Funcionario</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Empresas com Acesso *</Label>
                  <div className="border rounded-lg p-3 space-y-2">
                    {companies.map((company) => (
                      <div key={company.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={company.id}
                          checked={selectedCompanies.includes(company.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCompanies([...selectedCompanies, company.id]);
                            } else {
                              setSelectedCompanies(selectedCompanies.filter(id => id !== company.id));
                            }
                          }}
                        />
                        <Label htmlFor={company.id} className="text-sm font-normal cursor-pointer">
                          {company.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A primeira empresa selecionada sera a padrao
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={isCreatingUser}>
                  {isCreatingUser ? "Criando..." : "Criar Usuario"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configuracoes do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-3">Empresas Cadastradas</h3>
                <div className="space-y-2">
                  {companies.map((company) => (
                    <div key={company.id} className="flex items-center gap-2 p-2 bg-card rounded">
                      <Building2 className="w-4 h-4 text-primary" />
                      <span>{company.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Notificacoes Automaticas
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  O sistema verifica automaticamente documentos vencendo e envia notificacoes com 10 dias de antecedencia.
                </p>
                <Button 
                  variant="outline" 
                  onClick={handleCheckNotifications}
                  disabled={checkingNotifications}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${checkingNotifications ? 'animate-spin' : ''}`} />
                  Executar Verificacao Manual
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
