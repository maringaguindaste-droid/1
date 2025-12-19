import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Send, Trash2, CheckCheck, Loader2, FileEdit, User, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/EmptyState";

export default function Notifications() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [employees, setEmployees] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const handleUpdateDocument = (employeeId: string | null, documentId: string | null) => {
    if (employeeId) {
      navigate(`/employees/${employeeId}/view`);
    }
  };

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, user_id")
        .eq("status", "ATIVO")
        .order("full_name");

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Erro ao carregar funcionários");
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);

    const formData = new FormData(e.currentTarget);
    const recipient = formData.get("recipient") as string;
    const type = formData.get("type") as string;
    const message = formData.get("message") as string;

    try {
      if (recipient === "all_admins") {
        // Send to all admins
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        if (admins) {
          const notifications = admins.map(admin => ({
            user_id: admin.user_id,
            type,
            message
          }));

          const { error } = await supabase
            .from("notifications")
            .insert(notifications);

          if (error) throw error;
        }
      } else if (recipient === "all_employees") {
        // Send to all employees with system access
        const { data: employees } = await supabase
          .from("employees")
          .select("user_id")
          .not("user_id", "is", null)
          .eq("status", "ATIVO");

        if (employees) {
          const notifications = employees.map(emp => ({
            user_id: emp.user_id,
            type,
            message
          }));

          const { error } = await supabase
            .from("notifications")
            .insert(notifications);

          if (error) throw error;
        }
      } else {
        // Send to specific employee
        const { error } = await supabase
          .from("notifications")
          .insert({
            user_id: recipient,
            type,
            message
          });

        if (error) throw error;
      }

      toast.success("Notificação enviada com sucesso!");
      e.currentTarget.reset();
    } catch (error: any) {
      console.error("Error sending notification:", error);
      toast.error("Erro ao enviar notificação");
    } finally {
      setSending(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "success": return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "warning": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "error": return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Notificações</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie todas as notificações do sistema
          </p>
        </div>
        {notifications.length > 0 && (
          <Button onClick={markAllAsRead} variant="outline" className="w-full md:w-auto">
            <CheckCheck className="w-4 h-4 mr-2" />
            Marcar Todas Como Lidas
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Admin Panel - Send Notifications */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Enviar Notificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendNotification} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recipient">Destinatário *</Label>
                  <Select name="recipient" required onValueChange={() => fetchEmployees()}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o destinatário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_admins">Todos os Administradores</SelectItem>
                      <SelectItem value="all_employees">Todos os Funcionários</SelectItem>
                      {loadingEmployees ? (
                        <SelectItem value="loading" disabled>Carregando...</SelectItem>
                      ) : (
                        employees
                          .filter(emp => emp.user_id)
                          .map(emp => (
                            <SelectItem key={emp.id} value={emp.user_id}>
                              {emp.full_name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo *</Label>
                  <Select name="type" required defaultValue="info">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Informação</SelectItem>
                      <SelectItem value="success">Sucesso</SelectItem>
                      <SelectItem value="warning">Aviso</SelectItem>
                      <SelectItem value="error">Erro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    placeholder="Digite a mensagem da notificação..."
                    rows={4}
                  />
                </div>

                <Button type="submit" disabled={sending} className="w-full">
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Notificação
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Notifications List */}
        <Card className={isAdmin ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Minhas Notificações ({notifications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="Nenhuma notificação"
                description="Você não tem notificações no momento"
              />
            ) : (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-lg border transition-all ${
                        notification.read
                          ? "bg-background"
                          : "bg-accent/50 border-primary/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getTypeColor(notification.type)}>
                              {notification.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(notification.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          
                          {/* Show employee and document info */}
                          {(notification.employee_name || notification.document_type_name) && (
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {notification.employee_name && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {notification.employee_name}
                                </span>
                              )}
                              {notification.document_type_name && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {notification.document_type_name}
                                </span>
                              )}
                            </div>
                          )}
                          
                          <p className="text-sm">{notification.message}</p>
                          
                          {/* Update document button */}
                          {notification.employee_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={() => handleUpdateDocument(notification.employee_id, notification.document_id)}
                            >
                              <FileEdit className="w-4 h-4 mr-2" />
                              Atualizar Documento
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!notification.read && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <CheckCheck className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
