import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Upload, Loader2, FileCheck, AlertCircle, X, FileText } from "lucide-react";

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

interface ScanResult {
  success: boolean;
  document_type?: string;
  data?: ScannedData;
  confidence?: number;
  error?: string;
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
        body: { imageBase64: selectedImage }
      });

      if (error) {
        throw new Error(error.message);
      }

      setScanResult(data);

      if (data.success && data.data) {
        toast({
          title: "Documento escaneado!",
          description: `${data.document_type || 'Documento'} reconhecido com ${Math.round((data.confidence || 0) * 100)}% de confiança`,
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

  const handleApplyData = () => {
    if (scanResult?.success && scanResult.data) {
      onDataExtracted(scanResult.data);
      onOpenChange(false);
      setSelectedImage(null);
      setSelectedFileName(null);
      setIsPdf(false);
      setScanResult(null);
      
      toast({
        title: "Dados aplicados!",
        description: "Os campos foram preenchidos automaticamente. Revise as informações.",
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedImage(null);
    setSelectedFileName(null);
    setIsPdf(false);
    setScanResult(null);
  };

  const countExtractedFields = (data: ScannedData): number => {
    return Object.values(data).filter(v => v !== null && v !== undefined && v !== '').length;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Scanner de Documento
          </DialogTitle>
          <DialogDescription>
            Tire uma foto ou faça upload de um documento (RG, CNH, CTPS, PDF) para preencher automaticamente todos os campos
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
                  <p className="font-medium">Arraste a imagem/PDF ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Formatos: JPG, PNG, WEBP, PDF (máx. 10MB)
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                {isPdf ? (
                  <div className="w-full rounded-lg border bg-muted/50 p-8 flex flex-col items-center gap-3">
                    <FileText className="w-16 h-16 text-primary" />
                    <p className="text-sm font-medium">{selectedFileName}</p>
                    <p className="text-xs text-muted-foreground">Documento PDF selecionado</p>
                  </div>
                ) : (
                  <img
                    src={selectedImage}
                    alt="Documento selecionado"
                    className="w-full rounded-lg border max-h-64 object-contain bg-muted/50"
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-background/80 hover:bg-background"
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
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                      <FileCheck className="w-4 h-4" />
                      Dados extraídos com sucesso!
                    </div>
                    <span className="text-xs bg-green-500/20 px-2 py-1 rounded">
                      {countExtractedFields(scanResult.data)} campos
                    </span>
                  </div>
                  <div className="text-sm space-y-1 max-h-48 overflow-y-auto">
                    {/* Identificação */}
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
                    {scanResult.data.filiation && (
                      <p><span className="text-muted-foreground">Filiação:</span> {scanResult.data.filiation}</p>
                    )}
                    {scanResult.data.nationality && (
                      <p><span className="text-muted-foreground">Nacionalidade:</span> {scanResult.data.nationality}</p>
                    )}
                    {scanResult.data.naturalness && (
                      <p><span className="text-muted-foreground">Naturalidade:</span> {scanResult.data.naturalness}</p>
                    )}
                    
                    {/* Endereço */}
                    {scanResult.data.cep && (
                      <p><span className="text-muted-foreground">CEP:</span> {scanResult.data.cep}</p>
                    )}
                    {scanResult.data.municipality && (
                      <p><span className="text-muted-foreground">Município:</span> {scanResult.data.municipality}</p>
                    )}
                    {scanResult.data.neighborhood && (
                      <p><span className="text-muted-foreground">Bairro:</span> {scanResult.data.neighborhood}</p>
                    )}
                    {scanResult.data.address && (
                      <p><span className="text-muted-foreground">Endereço:</span> {scanResult.data.address}</p>
                    )}
                    
                    {/* Contato */}
                    {scanResult.data.phone && (
                      <p><span className="text-muted-foreground">Telefone:</span> {scanResult.data.phone}</p>
                    )}
                    {scanResult.data.mobile && (
                      <p><span className="text-muted-foreground">Celular:</span> {scanResult.data.mobile}</p>
                    )}
                    {scanResult.data.email && (
                      <p><span className="text-muted-foreground">Email:</span> {scanResult.data.email}</p>
                    )}
                    
                    {/* Profissional */}
                    {scanResult.data.position && (
                      <p><span className="text-muted-foreground">Cargo:</span> {scanResult.data.position}</p>
                    )}
                    {scanResult.data.admission_date && (
                      <p><span className="text-muted-foreground">Data Admissão:</span> {scanResult.data.admission_date}</p>
                    )}
                    {scanResult.data.validation_date && (
                      <p><span className="text-muted-foreground">Data Validação:</span> {scanResult.data.validation_date}</p>
                    )}
                    {scanResult.data.responsible_function && (
                      <p><span className="text-muted-foreground">Função:</span> {scanResult.data.responsible_function}</p>
                    )}
                    {scanResult.data.work_location && (
                      <p><span className="text-muted-foreground">Local Trabalho:</span> {scanResult.data.work_location}</p>
                    )}
                  </div>
                </div>
              )}

              {scanResult && !scanResult.success && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertCircle className="w-4 h-4" />
                    {scanResult.error || "Não foi possível extrair dados"}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!scanResult?.success ? (
                  <Button
                    onClick={handleScan}
                    disabled={scanning}
                    className="flex-1"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        Escanear Documento
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleApplyData}
                    className="flex-1"
                  >
                    <FileCheck className="w-4 h-4 mr-2" />
                    Aplicar Dados
                  </Button>
                )}
                
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Mobile camera input */}
          <div className="text-center">
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
      </DialogContent>
    </Dialog>
  );
};

export default DocumentScanner;
