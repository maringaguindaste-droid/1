import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Upload, Loader2, FileCheck, AlertCircle, X, FileText, Plus, Check, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ScannedData {
  full_name?: string | null;
  cpf?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  filiation?: string | null;
  nationality?: string | null;
  naturalness?: string | null;
  // Campos de endereço
  cep?: string | null;
  municipality?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  // Campos de contato
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  // Campos profissionais
  position?: string | null;
  admission_date?: string | null;
  validation_date?: string | null;
  responsible_function?: string | null;
  work_location?: string | null;
}

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
  data?: ScannedData;
  confidence?: number;
  error?: string;
  signatures?: SignatureInfo;
}

interface ScannedDocument {
  fileName: string;
  documentType: string;
  data: ScannedData;
  confidence: number;
  signatures?: SignatureInfo;
}

interface DocumentScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataExtracted: (data: ScannedData) => void;
}

const DocumentScanner = ({ open, onOpenChange, onDataExtracted }: DocumentScannerProps) => {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scannedDocuments, setScannedDocuments] = useState<ScannedDocument[]>([]);
  const [accumulatedData, setAccumulatedData] = useState<ScannedData>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const isPdfFile = file.type === 'application/pdf';
      setIsPdf(isPdfFile);
      setSelectedFileName(file.name);
      
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
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const handleScan = async () => {
    if (!selectedImage) return;

    setScanning(true);
    setScanResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scan-document', {
        body: { 
          imageBase64: selectedImage,
          mode: 'employee' // Modo para extração de dados de funcionário
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setScanResult(data);

      if (data.success && data.data) {
        const sigCount = data.signatures?.count || 0;
        toast({
          title: "Documento escaneado!",
          description: `${data.document_type || 'Documento'} reconhecido com ${Math.round((data.confidence || 0) * 100)}% de confiança${sigCount > 0 ? ` - ${sigCount} assinatura(s)` : ''}`,
        });
      } else {
        toast({
          title: "Erro ao escanear",
          description: data.error || "Não foi possível extrair dados do documento",
          variant: "destructive",
        });
      }
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

  const handleApplyAndContinue = () => {
    if (scanResult?.success && scanResult.data) {
      // Adiciona o documento à lista de escaneados
      setScannedDocuments(prev => [...prev, {
        fileName: selectedFileName || 'documento',
        documentType: scanResult.document_type || 'Documento',
        data: scanResult.data!,
        confidence: scanResult.confidence || 0,
        signatures: scanResult.signatures
      }]);

      // Acumula os dados (não sobrescreve campos já preenchidos)
      setAccumulatedData(prev => {
        const newData = { ...prev };
        Object.entries(scanResult.data!).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            // Só sobrescreve se o campo atual estiver vazio
            if (!prev[key as keyof ScannedData]) {
              newData[key as keyof ScannedData] = value as any;
            }
          }
        });
        return newData;
      });

      // Limpa para escanear outro
      setSelectedImage(null);
      setSelectedFileName(null);
      setIsPdf(false);
      setScanResult(null);

      toast({
        title: "Dados adicionados!",
        description: "Você pode escanear mais documentos ou aplicar os dados.",
      });
    }
  };

  const handleApplyAllData = () => {
    // Se tem resultado atual, adiciona aos acumulados primeiro
    let finalData = { ...accumulatedData };
    
    if (scanResult?.success && scanResult.data) {
      Object.entries(scanResult.data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (!finalData[key as keyof ScannedData]) {
            finalData[key as keyof ScannedData] = value as any;
          }
        }
      });
    }

    onDataExtracted(finalData);
    handleClose();
    
    toast({
      title: "Dados aplicados!",
      description: `${scannedDocuments.length + (scanResult?.success ? 1 : 0)} documento(s) processado(s). Revise as informações.`,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedImage(null);
    setSelectedFileName(null);
    setIsPdf(false);
    setScanResult(null);
    setScannedDocuments([]);
    setAccumulatedData({});
  };

  const countExtractedFields = (data: ScannedData): number => {
    return Object.values(data).filter(v => v !== null && v !== undefined && v !== '').length;
  };

  const getFilledSections = () => {
    const sections = {
      identification: ['full_name', 'cpf', 'rg', 'birth_date', 'filiation', 'nationality', 'naturalness'],
      address: ['cep', 'municipality', 'neighborhood', 'address'],
      contact: ['phone', 'mobile', 'email'],
      professional: ['position', 'admission_date', 'validation_date', 'responsible_function', 'work_location']
    };

    const filled: Record<string, boolean> = {};
    Object.entries(sections).forEach(([section, fields]) => {
      filled[section] = fields.some(f => accumulatedData[f as keyof ScannedData]);
    });
    return filled;
  };

  const filledSections = getFilledSections();

  const renderSignatureStatus = (signatures?: SignatureInfo) => {
    if (!signatures) return null;
    
    const { count, is_fully_signed, has_employee_signature, has_instructor_signature, has_responsible_signature } = signatures;
    
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {is_fully_signed ? (
          <Badge variant="default" className="gap-1 bg-green-600 text-xs">
            <PenTool className="w-3 h-3" />
            Completo ({count} ass.)
          </Badge>
        ) : count > 0 ? (
          <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
            <PenTool className="w-3 h-3" />
            {count} assinatura(s)
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1 text-xs">
            <AlertCircle className="w-3 h-3" />
            Sem assinaturas
          </Badge>
        )}
        
        {count > 0 && (
          <div className="flex gap-1 flex-wrap">
            {has_employee_signature && (
              <Badge variant="outline" className="text-xs bg-green-500/10 border-green-500/30">
                Funcionário
              </Badge>
            )}
            {has_instructor_signature && (
              <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30">
                Instrutor
              </Badge>
            )}
            {has_responsible_signature && (
              <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30">
                Responsável
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Scanner de Documento
          </DialogTitle>
          <DialogDescription>
            Escaneie múltiplos documentos para preencher todos os campos automaticamente
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de seções preenchidas */}
        {scannedDocuments.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            <Badge variant={filledSections.identification ? "default" : "outline"} className="text-xs">
              {filledSections.identification ? <Check className="w-3 h-3 mr-1" /> : null}
              Identificação
            </Badge>
            <Badge variant={filledSections.address ? "default" : "outline"} className="text-xs">
              {filledSections.address ? <Check className="w-3 h-3 mr-1" /> : null}
              Endereço
            </Badge>
            <Badge variant={filledSections.contact ? "default" : "outline"} className="text-xs">
              {filledSections.contact ? <Check className="w-3 h-3 mr-1" /> : null}
              Contato
            </Badge>
            <Badge variant={filledSections.professional ? "default" : "outline"} className="text-xs">
              {filledSections.professional ? <Check className="w-3 h-3 mr-1" /> : null}
              Profissional
            </Badge>
          </div>
        )}

        {/* Lista de documentos já escaneados */}
        {scannedDocuments.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 mb-2">
            <p className="text-sm font-medium mb-2">{scannedDocuments.length} documento(s) escaneado(s):</p>
            <ScrollArea className="max-h-24">
              <div className="space-y-1">
                {scannedDocuments.map((doc, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {doc.documentType}
                    </Badge>
                    {doc.signatures && doc.signatures.count > 0 && (
                      <Badge 
                        variant={doc.signatures.is_fully_signed ? "default" : "outline"} 
                        className={`text-xs gap-1 ${doc.signatures.is_fully_signed ? 'bg-green-600' : ''}`}
                      >
                        <PenTool className="w-2 h-2" />
                        {doc.signatures.count}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-4 pr-2">
            {!selectedImage ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 md:p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm md:text-base">Arraste a imagem/PDF ou clique para selecionar</p>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">
                      Formatos: JPG, PNG, WEBP, PDF (máx. 10MB)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  {isPdf ? (
                    <div className="w-full rounded-lg border bg-muted/50 p-6 flex flex-col items-center gap-3">
                      <FileText className="w-12 h-12 text-primary" />
                      <p className="text-sm font-medium truncate max-w-full">{selectedFileName}</p>
                      <p className="text-xs text-muted-foreground">Documento PDF selecionado</p>
                    </div>
                  ) : (
                    <img
                      src={selectedImage}
                      alt="Documento selecionado"
                      className="w-full rounded-lg border max-h-48 object-contain bg-muted/50"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-background/80 hover:bg-background h-8 w-8"
                    onClick={() => {
                      setSelectedImage(null);
                      setSelectedFileName(null);
                      setIsPdf(false);
                      setScanResult(null);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {scanResult?.success && scanResult.data && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium text-sm">
                        <FileCheck className="w-4 h-4" />
                        Dados extraídos!
                      </div>
                      <span className="text-xs bg-green-500/20 px-2 py-1 rounded">
                        {countExtractedFields(scanResult.data)} campos
                      </span>
                    </div>
                    
                    {/* Exibir status das assinaturas */}
                    {renderSignatureStatus(scanResult.signatures)}
                    
                    <ScrollArea className="max-h-32">
                      <div className="text-xs space-y-1 mt-2">
                        {scanResult.data.full_name && (
                          <p><span className="text-muted-foreground">Nome:</span> {scanResult.data.full_name}</p>
                        )}
                        {scanResult.data.cpf && (
                          <p><span className="text-muted-foreground">CPF:</span> {scanResult.data.cpf}</p>
                        )}
                        {scanResult.data.rg && (
                          <p><span className="text-muted-foreground">RG:</span> {scanResult.data.rg}</p>
                        )}
                        {scanResult.data.birth_date && (
                          <p><span className="text-muted-foreground">Nascimento:</span> {scanResult.data.birth_date}</p>
                        )}
                        {scanResult.data.admission_date && (
                          <p><span className="text-muted-foreground">Admissão:</span> {scanResult.data.admission_date}</p>
                        )}
                        {scanResult.data.position && (
                          <p><span className="text-muted-foreground">Cargo:</span> {scanResult.data.position}</p>
                        )}
                        {scanResult.data.cep && (
                          <p><span className="text-muted-foreground">CEP:</span> {scanResult.data.cep}</p>
                        )}
                        {scanResult.data.municipality && (
                          <p><span className="text-muted-foreground">Cidade:</span> {scanResult.data.municipality}</p>
                        )}
                        {scanResult.data.address && (
                          <p><span className="text-muted-foreground">Endereço:</span> {scanResult.data.address}</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {scanResult && !scanResult.success && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {scanResult.error || "Não foi possível extrair dados"}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  {!scanResult?.success ? (
                    <Button
                      onClick={handleScan}
                      disabled={scanning}
                      className="flex-1"
                      size="sm"
                    >
                      {scanning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4 mr-2" />
                          Escanear
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={handleApplyAndContinue}
                        variant="outline"
                        className="flex-1"
                        size="sm"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Escanear Outro
                      </Button>
                      <Button
                        onClick={handleApplyAllData}
                        className="flex-1"
                        size="sm"
                      >
                        <FileCheck className="w-4 h-4 mr-2" />
                        Aplicar Dados
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Mobile camera input */}
            <div className="text-center pt-2">
              <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                <Camera className="w-4 h-4" />
                Usar câmera do dispositivo
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const isPdfFile = file.type === 'application/pdf';
                      setIsPdf(isPdfFile);
                      setSelectedFileName(file.name);
                      
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
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose} size="sm">
            Cancelar
          </Button>
          {(scannedDocuments.length > 0 || scanResult?.success) && (
            <Button onClick={handleApplyAllData} size="sm">
              <FileCheck className="w-4 h-4 mr-2" />
              Aplicar {scannedDocuments.length + (scanResult?.success ? 1 : 0)} documento(s)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentScanner;
