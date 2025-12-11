import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Loader2, Upload, File, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  document_type_id: string | null;
  expiration_date: string | null;
  observations: string | null;
  status: string;
}

interface DocumentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  onSave: () => void;
}

export function DocumentEditDialog({ open, onOpenChange, document, onSave }: DocumentEditDialogProps) {
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    document_type_id: "",
    expiration_date: "",
    observations: "",
    status: ""
  });

  useEffect(() => {
    if (open) {
      fetchDocumentTypes();
      if (document) {
        setFormData({
          document_type_id: document.document_type_id || "",
          expiration_date: document.expiration_date || "",
          observations: document.observations || "",
          status: document.status || "pending"
        });
      }
    }
  }, [open, document]);

  const fetchDocumentTypes = async () => {
    const { data } = await supabase
      .from("document_types")
      .select("id, code, name")
      .eq("is_active", true)
      .order("code");
    
    if (data) setDocumentTypes(data);
  };

  const sanitizeFileName = (fileName: string): string => {
    const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSave = async () => {
    if (!document) return;

    try {
      setLoading(true);
      
      let updateData: any = {
        document_type_id: formData.document_type_id || null,
        expiration_date: formData.expiration_date || null,
        observations: formData.observations || null,
        updated_at: new Date().toISOString()
      };

      // Admin can change status
      if (isAdmin && formData.status) {
        updateData.status = formData.status;
        if (formData.status === "approved" || formData.status === "rejected") {
          updateData.validated_by = user?.id;
          updateData.validated_at = new Date().toISOString();
        }
      }

      // Upload new file if selected
      if (selectedFile) {
        setUploading(true);
        
        // Delete old file if exists
        if (document.file_path) {
          await supabase.storage.from('employee-documents').remove([document.file_path]);
        }

        // Get employee_id from document path or query
        const { data: docData } = await supabase
          .from("documents")
          .select("employee_id")
          .eq("id", document.id)
          .single();

        const employeeId = docData?.employee_id;
        const sanitizedFileName = sanitizeFileName(selectedFile.name);
        const newPath = `${employeeId}/${formData.document_type_id || 'general'}/${Date.now()}-${sanitizedFileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('employee-documents')
          .upload(newPath, selectedFile, {
            contentType: selectedFile.type
          });

        if (uploadError) throw uploadError;

        updateData.file_path = newPath;
        updateData.file_name = selectedFile.name;
        updateData.file_size = selectedFile.size;
        updateData.uploaded_by = user?.id;
        
        setUploading(false);
      }

      const { error } = await supabase
        .from("documents")
        .update(updateData)
        .eq("id", document.id);

      if (error) throw error;

      toast.success("Documento atualizado com sucesso");
      onSave();
      onOpenChange(false);
      setSelectedFile(null);
    } catch (error: any) {
      toast.error("Erro ao atualizar documento");
      console.error(error);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-primary" />
            Editar Documento
          </DialogTitle>
          <DialogDescription>
            Atualize os dados do documento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document_type">Tipo de Documento</Label>
            <Select
              value={formData.document_type_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, document_type_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.code} - {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiration_date">Data de Vencimento</Label>
            <Input
              id="expiration_date"
              type="date"
              value={formData.expiration_date}
              onChange={(e) => setFormData(prev => ({ ...prev, expiration_date: e.target.value }))}
            />
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                  <SelectItem value="expired">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="observations">Observações</Label>
            <Textarea
              id="observations"
              value={formData.observations}
              onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Observações sobre o documento"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Atualizar Arquivo</Label>
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <div className="flex items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  {selectedFile ? (
                    <div className="flex items-center gap-2 text-sm">
                      <File className="w-5 h-5 text-primary" />
                      <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="w-5 h-5" />
                      <span>Clique para substituir arquivo</span>
                    </div>
                  )}
                </div>
                <Input
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Arquivo atual: {document?.file_name || "Nenhum"}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading || uploading}>
              {(loading || uploading) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {uploading ? "Enviando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
