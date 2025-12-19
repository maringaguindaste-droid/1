import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit, Loader2, Upload, File, RefreshCw, Camera, CheckCircle2, AlertTriangle, PenTool, User, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";

interface DocumentType {
  id: string;
  code: string;
  name: string;
  default_validity_years: number | null;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  document_type_id: string | null;
  expiration_date: string | null;
  observations: string | null;
  status: string;
  employee_id?: string;
}

interface SignatureInfo {
  count: number;
  employee_signed: boolean;
  instructor_signed: boolean;
  responsible_signed: boolean;
  fully_signed: boolean;
}

interface ScanResult {
  document_type?: string;
  emission_date?: string;
  expiration_date?: string;
  signatures?: SignatureInfo;
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
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
      // Reset scan state
      setScanResult(null);
      setPreviewImage(null);
      setSelectedFile(null);
    }
  }, [open, document]);

  const fetchDocumentTypes = async () => {
    const { data } = await supabase
      .from("document_types")
      .select("id, code, name, default_validity_years")
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

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setScanResult(null);
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewImage(null);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf']
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false
  });

  const handleScan = async () => {
    if (!previewImage && !selectedFile) {
      toast.error("Selecione um arquivo primeiro");
      return;
    }

    setScanning(true);
    try {
      let imageBase64: string;
      
      // Send full base64 with data URI prefix for proper handling
      if (previewImage) {
        imageBase64 = previewImage;
      } else if (selectedFile) {
        imageBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(selectedFile);
        });
      } else {
        throw new Error("No file selected");
      }
      
      const { data, error } = await supabase.functions.invoke('scan-document', {
        body: { imageBase64, mode: 'document_form' }
      });

      if (error) throw error;

      console.log("Scan result:", data);
      setScanResult(data);

      // Auto-fill form with scan results
      if (data.document_type) {
        const foundType = findDocumentType(data.document_type);
        if (foundType) {
          setFormData(prev => ({ ...prev, document_type_id: foundType.id }));
        }
      }

      // Calculate or use expiration date
      let expDate = data.expiration_date;
      if (!expDate && data.emission_date) {
        const foundType = data.document_type ? findDocumentType(data.document_type) : null;
        const docType = foundType || documentTypes.find(dt => dt.id === formData.document_type_id);
        if (docType?.default_validity_years) {
          expDate = calculateExpirationDate(data.emission_date, docType.default_validity_years);
        }
      }
      
      if (expDate) {
        setFormData(prev => ({ ...prev, expiration_date: expDate }));
      }

      toast.success("Documento analisado com sucesso!");
    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error("Erro ao analisar documento");
    } finally {
      setScanning(false);
    }
  };

  const findDocumentType = (scannedType: string): DocumentType | null => {
    if (!scannedType) return null;
    const normalizedScanned = scannedType.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    let match = documentTypes.find(dt => 
      dt.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedScanned
    );
    if (match) return match;

    const nrMatch = normalizedScanned.match(/NR(\d+)/);
    if (nrMatch) {
      match = documentTypes.find(dt => 
        dt.code.toUpperCase().includes(`NR${nrMatch[1]}`) ||
        dt.name.toUpperCase().includes(`NR${nrMatch[1]}`)
      );
      if (match) return match;
    }

    return null;
  };

  const calculateExpirationDate = (emissionDate: string, validityYears: number): string => {
    const date = new Date(emissionDate);
    date.setFullYear(date.getFullYear() + validityYears);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
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

      if (isAdmin && formData.status) {
        updateData.status = formData.status;
        if (formData.status === "approved" || formData.status === "rejected") {
          updateData.validated_by = user?.id;
          updateData.validated_at = new Date().toISOString();
        }
      }

      if (selectedFile) {
        setUploading(true);
        
        if (document.file_path) {
          await supabase.storage.from('employee-documents').remove([document.file_path]);
        }

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
      setScanResult(null);
      setPreviewImage(null);
    } catch (error: any) {
      toast.error("Erro ao atualizar documento");
      console.error(error);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const renderSignatureStatus = () => {
    if (!scanResult?.signatures) return null;
    const sig = scanResult.signatures;

    return (
      <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <PenTool className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Assinaturas</span>
          <Badge variant={sig.fully_signed ? "default" : "secondary"}>
            {sig.count} assinatura(s)
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={sig.employee_signed ? "default" : "outline"} className="text-xs">
            <User className="w-3 h-3 mr-1" />
            Funcionário {sig.employee_signed ? "✓" : "✗"}
          </Badge>
          <Badge variant={sig.instructor_signed ? "default" : "outline"} className="text-xs">
            <UserCheck className="w-3 h-3 mr-1" />
            Instrutor {sig.instructor_signed ? "✓" : "✗"}
          </Badge>
          <Badge variant={sig.responsible_signed ? "default" : "outline"} className="text-xs">
            <UserCheck className="w-3 h-3 mr-1" />
            Responsável {sig.responsible_signed ? "✓" : "✗"}
          </Badge>
        </div>
        {sig.fully_signed && (
          <div className="flex items-center gap-1 text-success text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>Completamente assinado</span>
          </div>
        )}
        {!sig.fully_signed && sig.count > 0 && (
          <div className="flex items-center gap-1 text-warning text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Parcialmente assinado</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-primary" />
            Editar Documento
          </DialogTitle>
          <DialogDescription>
            Atualize os dados do documento ou escaneie um novo arquivo com IA
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
            <Label>Atualizar Arquivo com IA</Label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <File className="w-8 h-8 text-primary" />
                  <span className="text-sm truncate max-w-full">{selectedFile.name}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Arraste ou clique para selecionar novo arquivo
                  </span>
                </div>
              )}
            </div>
            
            {selectedFile && (
              <Button 
                variant="outline" 
                className="w-full mt-2" 
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Escanear com IA
                  </>
                )}
              </Button>
            )}

            {scanResult && (
              <div className="p-3 bg-success/10 rounded-lg border border-success/30 space-y-2">
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Documento Analisado</span>
                </div>
                {scanResult.document_type && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Tipo:</span>{" "}
                    <Badge variant="outline">{scanResult.document_type}</Badge>
                  </div>
                )}
                {scanResult.emission_date && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Emissão:</span>{" "}
                    {new Date(scanResult.emission_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                )}
                {renderSignatureStatus()}
              </div>
            )}

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
