import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, Loader2, CheckCircle2, AlertTriangle, Upload, FileText, PenTool, User, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";

interface SignatureInfo {
  count: number;
  employee_signed: boolean;
  instructor_signed: boolean;
  responsible_signed: boolean;
  fully_signed: boolean;
}

interface ScanResult {
  document_type?: string;
  document_type_name?: string;
  emission_date?: string;
  expiration_date?: string;
  signatures?: SignatureInfo;
  confidence?: number;
}

interface DocumentAIUpdateScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  employeeId: string;
  currentDocumentTypeId: string | null;
  onUpdate: () => void;
}

export function DocumentAIUpdateScanner({
  open,
  onOpenChange,
  documentId,
  employeeId,
  currentDocumentTypeId,
  onUpdate
}: DocumentAIUpdateScannerProps) {
  const { user } = useAuth();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setScanResult(null);
      };
      reader.readAsDataURL(file);

      // Fetch document types
      const { data } = await supabase
        .from("document_types")
        .select("id, code, name, default_validity_years")
        .eq("is_active", true);
      if (data) setDocumentTypes(data);
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

  const sanitizeFileName = (fileName: string): string => {
    const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    setScanning(true);
    try {
      // Send full base64 with data URI prefix
      const { data, error } = await supabase.functions.invoke('scan-document', {
        body: { imageBase64: selectedImage, mode: 'document_form' }
      });

      if (error) throw error;

      console.log("Scan result:", data);
      setScanResult(data);
      toast.success("Documento analisado com sucesso!");
    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error("Erro ao analisar documento");
    } finally {
      setScanning(false);
    }
  };

  const findDocumentType = (scannedType: string) => {
    if (!scannedType) return null;
    const normalizedScanned = scannedType.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Try exact code match
    let match = documentTypes.find(dt => 
      dt.code.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedScanned
    );
    if (match) return match;

    // Try NR code in name
    const nrMatch = normalizedScanned.match(/NR(\d+)/);
    if (nrMatch) {
      match = documentTypes.find(dt => 
        dt.code.toUpperCase().includes(`NR${nrMatch[1]}`) ||
        dt.name.toUpperCase().includes(`NR${nrMatch[1]}`) ||
        dt.name.toUpperCase().includes(`NR ${nrMatch[1]}`) ||
        dt.name.toUpperCase().includes(`NR-${nrMatch[1]}`)
      );
      if (match) return match;
    }

    // Try partial match
    match = documentTypes.find(dt => 
      dt.code.toUpperCase().includes(normalizedScanned) ||
      normalizedScanned.includes(dt.code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    );
    
    return match;
  };

  const calculateExpirationDate = (emissionDate: string, validityYears: number): string => {
    const date = new Date(emissionDate);
    date.setFullYear(date.getFullYear() + validityYears);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const handleUpdate = async () => {
    if (!selectedFile || !scanResult) return;

    setUpdating(true);
    try {
      // Find document type
      let documentTypeId = currentDocumentTypeId;
      if (scanResult.document_type) {
        const foundType = findDocumentType(scanResult.document_type);
        if (foundType) {
          documentTypeId = foundType.id;
        }
      }

      // Calculate expiration date
      let expirationDate = scanResult.expiration_date;
      if (!expirationDate && scanResult.emission_date) {
        const docType = documentTypes.find(dt => dt.id === documentTypeId);
        if (docType?.default_validity_years) {
          expirationDate = calculateExpirationDate(scanResult.emission_date, docType.default_validity_years);
        }
      }

      // Upload new file
      const sanitizedFileName = sanitizeFileName(selectedFile.name);
      const newPath = `${employeeId}/${documentTypeId || 'general'}/${Date.now()}-${sanitizedFileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('employee-documents')
        .upload(newPath, selectedFile, { contentType: selectedFile.type });

      if (uploadError) throw uploadError;

      // Update document record
      const updateData: any = {
        file_path: newPath,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        uploaded_by: user?.id,
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      if (documentTypeId) {
        updateData.document_type_id = documentTypeId;
      }

      if (expirationDate) {
        updateData.expiration_date = expirationDate;
      }

      const { error } = await supabase
        .from("documents")
        .update(updateData)
        .eq("id", documentId);

      if (error) throw error;

      toast.success("Documento atualizado com sucesso!");
      onUpdate();
      handleClose();
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error("Erro ao atualizar documento");
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setScanResult(null);
    onOpenChange(false);
  };

  const renderSignatureStatus = () => {
    if (!scanResult?.signatures) return null;
    const sig = scanResult.signatures;

    return (
      <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <PenTool className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">Assinaturas Detectadas</span>
          <Badge variant={sig.fully_signed ? "default" : "secondary"}>
            {sig.count} assinatura(s)
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
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
          <div className="flex items-center gap-1 text-success text-sm mt-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>Documento completamente assinado</span>
          </div>
        )}
        {!sig.fully_signed && sig.count > 0 && (
          <div className="flex items-center gap-1 text-warning text-sm mt-1">
            <AlertTriangle className="w-4 h-4" />
            <span>Documento parcialmente assinado</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Atualizar Documento com IA
          </DialogTitle>
          <DialogDescription>
            Faça upload de um novo arquivo e a IA identificará automaticamente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedImage ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {isDragActive ? "Solte o arquivo aqui" : "Arraste ou clique para selecionar"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">PDF, PNG, JPG (máx 10MB)</p>
            </div>
          ) : (
            <>
              <div className="relative border rounded-lg overflow-hidden">
                {selectedImage.startsWith('data:image') ? (
                  <img src={selectedImage} alt="Preview" className="w-full max-h-48 object-contain" />
                ) : (
                  <div className="flex items-center justify-center p-8 bg-muted">
                    <FileText className="w-16 h-16 text-muted-foreground" />
                  </div>
                )}
              </div>

              {selectedFile && (
                <p className="text-sm text-muted-foreground text-center">
                  {selectedFile.name}
                </p>
              )}

              {!scanResult && (
                <Button onClick={handleScan} disabled={scanning} className="w-full">
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mr-2" />
                      Analisar com IA
                    </>
                  )}
                </Button>
              )}

              {scanResult && (
                <div className="space-y-3 p-4 bg-success/10 rounded-lg border border-success/30">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="w-5 h-5" />
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
                      <span className="text-muted-foreground">Data Emissão:</span>{" "}
                      {new Date(scanResult.emission_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  )}
                  
                  {scanResult.expiration_date && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Validade:</span>{" "}
                      {new Date(scanResult.expiration_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  )}

                  {renderSignatureStatus()}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={handleClose} disabled={updating} className="flex-1">
              Cancelar
            </Button>
            {scanResult && (
              <Button onClick={handleUpdate} disabled={updating} className="flex-1">
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  "Atualizar Documento"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
