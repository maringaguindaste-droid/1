import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Loader2, FileCheck, AlertCircle, X, Calendar, PenTool, CheckCircle, AlertTriangle } from "lucide-react";

interface SignatureInfo {
  count: number;
  has_employee_signature: boolean;
  has_instructor_signature: boolean;
  has_responsible_signature: boolean;
  is_fully_signed: boolean;
  observations: string;
}

interface ScanResult {
  success: boolean;
  document_type?: string;
  document_type_name?: string;
  expiration_date?: string | null;
  emission_date?: string | null;
  confidence?: number;
  signatures?: SignatureInfo;
  error?: string;
}

interface DocumentScannerForFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: (data: {
    documentType?: string;
    expirationDate?: string;
    fileBase64: string;
    fileName: string;
    file: File;
    signatures?: SignatureInfo;
  }) => void;
  documentTypes: { id: string; code: string; name: string; default_validity_years?: number | null }[];
}

export function DocumentScannerForForm({ 
  open, 
  onOpenChange, 
  onScanComplete, 
  documentTypes 
}: DocumentScannerForFormProps) {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setScanResult(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024
  });

  const findDocumentType = (identifiedType: string) => {
    if (!identifiedType) return null;
    const normalizedType = identifiedType.toUpperCase().trim();
    
    // Try exact code match
    let match = documentTypes.find(dt => dt.code.toUpperCase() === normalizedType);
    if (match) return match;

    // Try NR code match (NR35, NR-35, NR 35)
    const nrMatch = normalizedType.match(/NR\s*-?\s*(\d+)/i);
    if (nrMatch) {
      const nrNumber = nrMatch[1];
      match = documentTypes.find(dt => {
        const dtCode = dt.code.toUpperCase();
        const dtName = dt.name.toUpperCase();
        return dtCode === `NR${nrNumber}` || 
               dtCode === `NR-${nrNumber}` ||
               dtCode.includes(nrNumber) ||
               dtName.includes(`NR-${nrNumber}`) ||
               dtName.includes(`NR ${nrNumber}`) ||
               dtName.includes(`NR${nrNumber}`);
      });
      if (match) return match;
    }

    // Try ASO match
    if (normalizedType.includes('ASO') || normalizedType.includes('ATESTADO') || normalizedType.includes('SAUDE')) {
      match = documentTypes.find(dt => 
        dt.code.toUpperCase().includes('ASO') || 
        dt.name.toUpperCase().includes('ASO') ||
        dt.name.toUpperCase().includes('ATESTADO')
      );
      if (match) return match;
    }

    // Try name match
    match = documentTypes.find(dt => 
      dt.name.toUpperCase().includes(normalizedType) ||
      normalizedType.includes(dt.name.toUpperCase()) ||
      normalizedType.includes(dt.code.toUpperCase())
    );
    
    return match;
  };

  const calculateExpirationDate = (emissionDate: string, validityYears: number): string => {
    const date = new Date(emissionDate);
    date.setFullYear(date.getFullYear() + validityYears);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    setScanning(true);
    setScanResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scan-document', {
        body: { 
          imageBase64: selectedImage,
          mode: 'document_form'
        }
      });

      if (error) throw new Error(error.message);

      console.log('Scan response:', data);

      if (!data.success) {
        throw new Error(data.error || 'Falha ao processar documento');
      }

      const result: ScanResult = {
        success: true,
        document_type: data.document_type,
        document_type_name: data.document_type_name,
        expiration_date: data.expiration_date,
        emission_date: data.emission_date,
        confidence: data.confidence,
        signatures: data.signatures
      };

      // If we have document type, try to match it
      if (result.document_type) {
        const matchedType = findDocumentType(result.document_type);
        if (matchedType) {
          result.document_type = matchedType.id;
          
          // If no expiration date but we have emission date and validity years
          if (!result.expiration_date && result.emission_date && matchedType.default_validity_years) {
            result.expiration_date = calculateExpirationDate(
              result.emission_date, 
              matchedType.default_validity_years
            );
          }
        }
      }

      setScanResult(result);
      
      const signatureStatus = result.signatures?.is_fully_signed 
        ? '✓ Documento assinado' 
        : result.signatures?.count 
          ? `${result.signatures.count} assinatura(s)` 
          : 'Sem assinaturas';
      
      toast({
        title: "Documento analisado!",
        description: `Confiança: ${Math.round((data.confidence || 0) * 100)}% | ${signatureStatus}`,
      });
    } catch (error: any) {
      console.error('Erro no scanner:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar documento",
        variant: "destructive",
      });
      setScanResult({ success: false, error: error.message });
    } finally {
      setScanning(false);
    }
  };

  const handleApply = () => {
    if (!selectedImage || !selectedFile) return;

    onScanComplete({
      documentType: scanResult?.document_type,
      expirationDate: scanResult?.expiration_date || undefined,
      fileBase64: selectedImage,
      fileName: selectedFile.name,
      file: selectedFile,
      signatures: scanResult?.signatures
    });
    
    handleClose();
    toast({
      title: "Dados aplicados!",
      description: "Revise as informações e preencha os campos restantes.",
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedImage(null);
    setSelectedFile(null);
    setScanResult(null);
  };

  const matchedDocType = scanResult?.document_type 
    ? documentTypes.find(dt => dt.id === scanResult.document_type)
    : null;

  const renderSignatureStatus = () => {
    if (!scanResult?.signatures) return null;

    const { count, is_fully_signed, has_employee_signature, has_instructor_signature, has_responsible_signature, observations } = scanResult.signatures;

    return (
      <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <PenTool className="w-4 h-4" />
          Verificação de Assinaturas
        </div>
        
        <div className="flex flex-wrap gap-2">
          {is_fully_signed ? (
            <Badge variant="default" className="gap-1 bg-green-600">
              <CheckCircle className="w-3 h-3" />
              Documento Completo ({count} assinatura{count !== 1 ? 's' : ''})
            </Badge>
          ) : count > 0 ? (
            <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-3 h-3" />
              Parcial ({count} assinatura{count !== 1 ? 's' : ''})
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="w-3 h-3" />
              Sem Assinaturas
            </Badge>
          )}
        </div>
        
        <div className="text-xs space-y-1 text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className={has_employee_signature ? 'text-green-600' : 'text-muted-foreground'}>
              {has_employee_signature ? '✓' : '○'} Funcionário
            </span>
            <span className={has_instructor_signature ? 'text-green-600' : 'text-muted-foreground'}>
              {has_instructor_signature ? '✓' : '○'} Instrutor
            </span>
            <span className={has_responsible_signature ? 'text-green-600' : 'text-muted-foreground'}>
              {has_responsible_signature ? '✓' : '○'} Responsável
            </span>
          </div>
          {observations && (
            <p className="italic">{observations}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Escanear Documento com IA
          </DialogTitle>
          <DialogDescription>
            Faça upload de um documento para identificar automaticamente o tipo, data e assinaturas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedImage ? (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Arraste o documento ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Formatos: JPG, PNG, PDF (máx. 10MB)
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={selectedImage}
                  alt="Documento"
                  className="w-full rounded-lg border max-h-64 object-contain bg-muted/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                  onClick={() => {
                    setSelectedImage(null);
                    setSelectedFile(null);
                    setScanResult(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {scanResult?.success && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                    <FileCheck className="w-4 h-4" />
                    Documento analisado!
                  </div>
                  <div className="text-sm space-y-1">
                    {matchedDocType ? (
                      <p>
                        <span className="text-muted-foreground">Tipo:</span>{" "}
                        {matchedDocType.code} - {matchedDocType.name}
                      </p>
                    ) : scanResult.document_type_name && (
                      <p>
                        <span className="text-muted-foreground">Tipo identificado:</span>{" "}
                        {scanResult.document_type} - {scanResult.document_type_name}
                      </p>
                    )}
                    {scanResult.emission_date && (
                      <p className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Emissão:</span>{" "}
                        {new Date(scanResult.emission_date).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                    {scanResult.expiration_date && (
                      <p className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Validade:</span>{" "}
                        {new Date(scanResult.expiration_date).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  
                  {renderSignatureStatus()}
                </div>
              )}

              {scanResult && !scanResult.success && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertCircle className="w-4 h-4" />
                    {scanResult.error || "Não foi possível analisar o documento"}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!scanResult?.success ? (
                  <Button onClick={handleScan} disabled={scanning} className="flex-1">
                    {scanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        Analisar Documento
                      </>
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleApply} className="flex-1">
                    <FileCheck className="w-4 h-4 mr-2" />
                    Usar Este Documento
                  </Button>
                )}
                
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="text-center">
            <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
              <Camera className="w-4 h-4" />
              Usar câmera do dispositivo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setSelectedImage(reader.result as string);
                      setScanResult(null);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
