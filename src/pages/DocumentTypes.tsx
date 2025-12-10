import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";

interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  default_validity_years: number | null;
  created_at: string;
}

export default function DocumentTypes() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [filteredTypes, setFilteredTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [currentType, setCurrentType] = useState<DocumentType | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTypes();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('document-types-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_types'
        },
        () => {
          fetchTypes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let filtered = types;

    if (searchTerm) {
      filtered = filtered.filter(type => 
        type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        type.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(type => 
        statusFilter === "active" ? type.is_active : !type.is_active
      );
    }

    setFilteredTypes(filtered);
  }, [types, searchTerm, statusFilter]);

  const fetchTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTypes(data || []);
    } catch (error: any) {
      console.error("Error fetching document types:", error);
      toast.error("Erro ao carregar tipos de documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const code = formData.get("code") as string;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const is_active = formData.get("is_active") === "on";
    const default_validity_years = formData.get("default_validity_years") as string;

    try {
      if (currentType) {
        // Update
        const { error } = await supabase
          .from("document_types")
          .update({ 
            code, 
            name, 
            description, 
            is_active,
            default_validity_years: default_validity_years ? parseInt(default_validity_years) : null
          })
          .eq("id", currentType.id);

        if (error) throw error;
        toast.success("Tipo de documento atualizado com sucesso!");
      } else {
        // Create
        const { error } = await supabase
          .from("document_types")
          .insert({ 
            code, 
            name, 
            description, 
            is_active,
            default_validity_years: default_validity_years ? parseInt(default_validity_years) : null
          });

        if (error) throw error;
        toast.success("Tipo de documento criado com sucesso!");
      }

      setDialogOpen(false);
      setCurrentType(null);
    } catch (error: any) {
      console.error("Error saving document type:", error);
      toast.error(error.message || "Erro ao salvar tipo de documento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!typeToDelete) return;

    try {
      const { error } = await supabase
        .from("document_types")
        .delete()
        .eq("id", typeToDelete);

      if (error) throw error;
      toast.success("Tipo de documento excluído com sucesso!");
      setDeleteDialogOpen(false);
      setTypeToDelete(null);
    } catch (error: any) {
      console.error("Error deleting document type:", error);
      toast.error("Erro ao excluir tipo de documento");
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("document_types")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success(`Tipo ${!currentStatus ? "ativado" : "desativado"} com sucesso!`);
    } catch (error: any) {
      console.error("Error toggling document type status:", error);
      toast.error("Erro ao alterar status");
    }
  };

  const openCreateDialog = () => {
    setCurrentType(null);
    setDialogOpen(true);
  };

  const openEditDialog = (type: DocumentType) => {
    setCurrentType(type);
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setTypeToDelete(id);
    setDeleteDialogOpen(true);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
            Tipos de Documentos
          </h1>
          <p className="text-muted-foreground">
            Gerencie as categorias e NRs de documentos do sistema
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Tipo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {currentType ? "Editar Tipo de Documento" : "Novo Tipo de Documento"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código / NR *</Label>
                <Input
                  id="code"
                  name="code"
                  defaultValue={currentType?.code}
                  placeholder="Ex: NR-01, ASO, etc"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={currentType?.name}
                  placeholder="Ex: Atestado de Saúde Ocupacional"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={currentType?.description || ""}
                  placeholder="Descrição opcional do tipo de documento"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_validity_years">Validade Padrão (anos)</Label>
                <Input
                  id="default_validity_years"
                  name="default_validity_years"
                  type="number"
                  min="1"
                  defaultValue={currentType?.default_validity_years || ""}
                  placeholder="Ex: 1, 2, 5"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  name="is_active"
                  defaultChecked={currentType?.is_active ?? true}
                />
                <Label htmlFor="is_active">Ativo</Label>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                Todos
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "outline"}
                onClick={() => setStatusFilter("active")}
              >
                Ativos
              </Button>
              <Button
                variant={statusFilter === "inactive" ? "default" : "outline"}
                onClick={() => setStatusFilter("inactive")}
              >
                Inativos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredTypes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum tipo de documento encontrado"
              description={
                searchTerm || statusFilter !== "all"
                  ? "Tente ajustar os filtros de busca"
                  : "Comece criando um novo tipo de documento"
              }
            />
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Validade (anos)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTypes.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell className="font-medium">{type.code}</TableCell>
                      <TableCell>{type.name}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {type.description || "-"}
                      </TableCell>
                      <TableCell>
                        {type.default_validity_years ? `${type.default_validity_years} ${type.default_validity_years === 1 ? 'ano' : 'anos'}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={type.is_active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => handleToggleActive(type.id, type.is_active)}
                        >
                          {type.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(type)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDeleteDialog(type.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este tipo de documento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
