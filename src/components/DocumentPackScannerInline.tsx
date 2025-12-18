import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Upload, Loader2, FileCheck, AlertCircle, X, FileText, 
  Trash2, Calendar, CheckCircle, AlertTriangle, Info, PenTool, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SignatureInfo {
  count: number;
  has_company_signature?: boolean;
  has_employee_signature: boolean;
  has_instructor_signature: boolean;
  has_responsible_signature?: boolean;
  is_fully_signed: boolean;
  details?: string;
  observations?: string;
}

interface ScannedDocument {
  id: string;
  fileName: string;
  fileData: string;
  mimeType: string;
  documentTypeId: string | null;
  documentTypeName: string;
  documentTypeCode: string;
  expirationDate: string | null;
  emissionDate: string | null;
  observations: string | null;
  confidence: number;
  success: boolean;
  error?: string;
  hasValidity: boolean;
  signatures?: SignatureInfo;
  isUpdate?: boolean;
  existingDocumentId?: string;
}

interface DocumentType {
  id: string;
  name: string;
  code: string;
  default_validity_years: number | null;
}

interface DocumentPackScannerInlineProps {
  employeeId?: string;
  onDocumentsScanned: (documents: ScannedDocument[]) => void;
}

export const DocumentPackScannerInline = ({ 
  employeeId, 
  onDocumentsScanned 
}: DocumentPackScannerInlineProps) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<{ file: File; preview: string; selected: boolean }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScannedDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [existingDocuments, setExistingDocuments] = useState<any[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  useEffect(() => {
    fetchDocumentTypes();
  }, []);

  // Fetch existing documents when employeeId changes
  useEffect(() => {
    if (employeeId) {
      fetchExistingDocuments();
    } else {
      setExistingDocuments([]);
    }
  }, [employeeId]);

  // Re-check results for updates when existingDocuments change
  useEffect(() => {
    if (existingDocuments.length > 0 && results.length > 0) {
      setResults(prev => prev.map(result => {
        const { isUpdate, existingId } = checkForExistingDocument(result.documentTypeId, result.expirationDate);
        return { ...result, isUpdate, existingDocumentId: existingId };
      }));
    }
  }, [existingDocuments]);

  useEffect(() => {
    onDocumentsScanned(results.filter(r => r.success && r.hasValidity));
  }, [results, onDocumentsScanned]);

  const fetchDocumentTypes = async () => {
    const { data, error } = await supabase
      .from("document_types")
      .select("id, name, code, default_validity_years")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setDocumentTypes(data);
    }
  };

  const fetchExistingDocuments = async () => {
    if (!employeeId) return;
    
    const { data, error } = await supabase
      .from("documents")
      .select("id, document_type_id, expiration_date, file_path")
      .eq("employee_id", employeeId);

    if (!error && data) {
      setExistingDocuments(data);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      selected: true
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxSize: 10 * 1024 * 1024
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleFileSelection = (index: number) => {
    setFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, selected: !f.selected } : f
    ));
  };

  const toggleAllFiles = () => {
    const allSelected = files.every(f => f.selected);
    setFiles(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const findMatchingDocumentType = (code: string, name: string): DocumentType | null => {
    // Exact code match
    let match = documentTypes.find(dt => 
      dt.code.toUpperCase() === code.toUpperCase()
    );
    if (match) return match;

    // Code contains NR number
    const nrMatch = code.match(/NR[-_]?(\d+)/i);
    if (nrMatch) {
      match = documentTypes.find(dt => 
        dt.code.includes(nrMatch[1]) || dt.name.includes(`NR-${nrMatch[1]}`) || dt.name.includes(`NR ${nrMatch[1]}`)
      );
      if (match) return match;
    }

    // ASO match
    if (code.toUpperCase().includes('ASO') || name.toUpperCase().includes('ASO') || name.toUpperCase().includes('ATESTADO')) {
      match = documentTypes.find(dt => 
        dt.code.toUpperCase().includes('ASO') || dt.name.toUpperCase().includes('ASO')
      );
      if (match) return match;
    }

    // Name contains the document type
    match = documentTypes.find(dt => 
      name.toUpperCase().includes(dt.name.toUpperCase()) ||
      dt.name.toUpperCase().includes(name.toUpperCase())
    );
    if (match) return match;

    return null;
  };

  const calculateExpirationDate = (
    emissionDate: string | null,
    validityYears: number | null
  ): string | null => {
    if (!emissionDate || !validityYears) return null;
    
    const emission = new Date(emissionDate);
    emission.setFullYear(emission.getFullYear() + validityYears);
    emission.setDate(emission.getDate() - 1);
    return emission.toISOString().split('T')[0];
  };

  // Check if this document should update an existing one
  const checkForExistingDocument = (documentTypeId: string | null, newExpirationDate: string | null): { isUpdate: boolean; existingId?: string } => {
    if (!documentTypeId || !employeeId) return { isUpdate: false };
    
    const existing = existingDocuments.find(doc => doc.document_type_id === documentTypeId);
    
    if (existing) {
      // If new expiration is later than existing, it's an update
      if (newExpirationDate && existing.expiration_date) {
        const newDate = new Date(newExpirationDate);
        const oldDate = new Date(existing.expiration_date);
        if (newDate > oldDate) {
          return { isUpdate: true, existingId: existing.id };
        }
      }
      // If no existing expiration but new has one, update
      if (newExpirationDate && !existing.expiration_date) {
        return { isUpdate: true, existingId: existing.id };
      }
      // If existing has expiration but it's expired and new document is valid
      if (existing.expiration_date) {
        const oldDate = new Date(existing.expiration_date);
        if (oldDate < new Date()) {
          return { isUpdate: true, existingId: existing.id };
        }
      }
    }
    
    return { isUpdate: false };
  };

  // Format signature info for observations field (defined early for use in handleScan)
  const formatSignatureObservation = (signatures: SignatureInfo): string => {
    const { count, has_company_signature, has_instructor_signature, has_employee_signature, is_fully_signed } = signatures;
    
    const parts = [
      `Empresa ${has_company_signature ? '✓' : '✗'}`,
      `Instrutor ${has_instructor_signature ? '✓' : '✗'}`,
      `Funcionário ${has_employee_signature ? '✓' : '✗'}`
    ];
    
    const status = is_fully_signed || count === 3 
      ? 'Completamente assinado' 
      : count > 0 
        ? 'Parcialmente assinado' 
        : 'Sem assinaturas';
    
    return `Assinaturas: ${count}/3 (${parts.join(', ')}) - ${status}`;
  };

  const handleScan = async () => {
    const selectedFiles = files.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Selecione ao menos um documento para escanear",
        variant: "destructive"
      });
      return;
    }

    setScanning(true);
    setResults([]);

    try {
      const filesData = await Promise.all(
        selectedFiles.map(async ({ file }) => ({
          fileName: file.name,
          base64: await convertToBase64(file),
          mimeType: file.type
        }))
      );

      const { data, error } = await supabase.functions.invoke('scan-document-pack', {
        body: { files: filesData }
      });

      if (error) throw error;

      const processedResults: ScannedDocument[] = data.results.map((result: any, index: number) => {
        const matchedType = result.success 
          ? findMatchingDocumentType(result.document_type_code || '', result.document_type_name || '')
          : null;

        let expirationDate = result.expiration_date;
        let hasValidity = true;

        // Calculate expiration if not found
        if (!expirationDate && result.emission_date && matchedType?.default_validity_years) {
          expirationDate = calculateExpirationDate(result.emission_date, matchedType.default_validity_years);
        }

        // Check if document type has validity
        if (matchedType && matchedType.default_validity_years === null && !expirationDate) {
          hasValidity = false;
        }

        // Check if this is an update to existing document
        const { isUpdate, existingId } = checkForExistingDocument(matchedType?.id || null, expirationDate);

        // Build observations with signature info
        let observations = result.observations || '';
        if (result.signatures) {
          const sigInfo = formatSignatureObservation(result.signatures);
          observations = observations ? `${observations}\n${sigInfo}` : sigInfo;
        }

        return {
          id: `${Date.now()}-${index}`,
          fileName: filesData[index].fileName,
          fileData: filesData[index].base64,
          mimeType: filesData[index].mimeType,
          documentTypeId: matchedType?.id || null,
          documentTypeName: result.document_type_name || 'Desconhecido',
          documentTypeCode: result.document_type_code || '',
          expirationDate,
          emissionDate: result.emission_date || null,
          observations,
          confidence: result.confidence || 0,
          success: result.success,
          error: result.error,
          hasValidity,
          signatures: result.signatures,
          isUpdate,
          existingDocumentId: existingId
        };
      });

      setResults(processedResults);
      setStep('review');

      const successCount = processedResults.filter(r => r.success).length;
      const updateCount = processedResults.filter(r => r.isUpdate).length;
      
      let description = `${successCount}/${processedResults.length} documentos processados`;
      if (updateCount > 0) {
        description += ` (${updateCount} atualização${updateCount > 1 ? 'ões' : ''})`;
      }
      
      toast({
        title: "Análise concluída",
        description,
      });

    } catch (error: any) {
      console.error('Erro ao escanear:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar documentos",
        variant: "destructive"
      });
    } finally {
      setScanning(false);
    }
  };

  const updateResult = (id: string, field: string, value: any) => {
    setResults(prev => prev.map(r => {
      if (r.id !== id) return r;
      
      const updated = { ...r, [field]: value };
      
      // Recalculate expiration if document type changed
      if (field === 'documentTypeId' && value) {
        const docType = documentTypes.find(dt => dt.id === value);
        if (docType) {
          updated.documentTypeName = docType.name;
          updated.documentTypeCode = docType.code;
          updated.hasValidity = docType.default_validity_years !== null || !!updated.expirationDate;
          
          if (!updated.expirationDate && updated.emissionDate && docType.default_validity_years) {
            updated.expirationDate = calculateExpirationDate(updated.emissionDate, docType.default_validity_years);
          }
          
          // Check if should update existing
          const { isUpdate, existingId } = checkForExistingDocument(value, updated.expirationDate);
          updated.isUpdate = isUpdate;
          updated.existingDocumentId = existingId;
        }
      }
      
      return updated;
    }));
  };

  const removeResult = (id: string) => {
    setResults(prev => prev.filter(r => r.id !== id));
  };

  const validResults = results.filter(r => r.success && r.hasValidity);
  const invalidResults = results.filter(r => !r.success || !r.hasValidity);

  const renderSignatureStatus = (signatures?: SignatureInfo) => {
    if (!signatures) return null;
    
    const { count, is_fully_signed, has_company_signature, has_instructor_signature, has_employee_signature } = signatures;
    
    // Build tooltip text
    const sigDetails = [
      `Empresa: ${has_company_signature ? '✓' : '✗'}`,
      `Instrutor: ${has_instructor_signature ? '✓' : '✗'}`,
      `Funcionário: ${has_employee_signature ? '✓' : '✗'}`
    ].join(' | ');
    
    if (is_fully_signed || count === 3) {
      return (
        <Badge variant="default" className="gap-1 bg-green-600 text-xs" title={sigDetails}>
          <PenTool className="w-2 h-2" />
          3/3
        </Badge>
      );
    } else if (count > 0) {
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs" title={sigDetails}>
          <PenTool className="w-2 h-2" />
          {count}/3
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive" className="gap-1 text-xs" title="Nenhuma assinatura detectada">
          <AlertCircle className="w-2 h-2" />
          0/3
        </Badge>
      );
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Importar Documentos com IA
        </CardTitle>
        <CardDescription className="text-xs">
          Faça upload de vários documentos para identificação automática com verificação de assinaturas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'upload' && (
          <>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <input {...getInputProps()} />
              <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Arraste ou clique para adicionar
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={files.every(f => f.selected)}
                      onCheckedChange={toggleAllFiles}
                    />
                    <span className="text-sm text-muted-foreground">
                      {files.filter(f => f.selected).length}/{files.length} selecionados
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles(prev => prev.filter(f => !f.selected))}
                    disabled={!files.some(f => f.selected)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Remover
                  </Button>
                </div>

                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {files.map((f, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
                        <Checkbox
                          checked={f.selected}
                          onCheckedChange={() => toggleFileSelection(index)}
                        />
                        <FileText className="w-3 h-3 text-muted-foreground" />
                        <span className="truncate flex-1">{f.file.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <Button
                  onClick={handleScan}
                  disabled={scanning || !files.some(f => f.selected)}
                  className="w-full"
                  size="sm"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4 mr-2" />
                      Escanear {files.filter(f => f.selected).length} documento(s)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        {step === 'review' && results.length > 0 && (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-1">
              {validResults.length > 0 && (
                <Badge variant="default" className="text-xs gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {validResults.length} válido(s)
                </Badge>
              )}
              {results.filter(r => r.isUpdate).length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1 bg-blue-500/20 text-blue-700 dark:text-blue-300">
                  <RefreshCw className="w-3 h-3" />
                  {results.filter(r => r.isUpdate).length} atualização(ões)
                </Badge>
              )}
              {invalidResults.filter(r => !r.hasValidity).length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Info className="w-3 h-3" />
                  {invalidResults.filter(r => !r.hasValidity).length} sem validade
                </Badge>
              )}
              {invalidResults.filter(r => !r.success).length > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {invalidResults.filter(r => !r.success).length} erro(s)
                </Badge>
              )}
            </div>

            <ScrollArea className="max-h-64">
              <div className="space-y-2 pr-2">
                {results.map((result) => (
                  <div
                    key={result.id}
                    className={`p-3 rounded-lg border text-xs space-y-2 ${
                      !result.success ? 'border-destructive/50 bg-destructive/5' :
                      result.isUpdate ? 'border-blue-500/50 bg-blue-500/5' :
                      !result.hasValidity ? 'border-amber-500/50 bg-amber-500/5' :
                      'border-green-500/50 bg-green-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium truncate">{result.fileName}</span>
                        {result.isUpdate && (
                          <Badge variant="secondary" className="text-xs gap-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 shrink-0">
                            <RefreshCw className="w-2 h-2" />
                            Atualizar
                          </Badge>
                        )}
                        {renderSignatureStatus(result.signatures)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={() => removeResult(result.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>

                    {result.success ? (
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Tipo de Documento</Label>
                          <Select
                            value={result.documentTypeId || ""}
                            onValueChange={(v) => updateResult(result.id, 'documentTypeId', v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder={result.documentTypeName} />
                            </SelectTrigger>
                            <SelectContent>
                              {documentTypes.map(dt => (
                                <SelectItem key={dt.id} value={dt.id} className="text-xs">
                                  {dt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Vencimento
                          </Label>
                          <Input
                            type="date"
                            value={result.expirationDate || ''}
                            onChange={(e) => updateResult(result.id, 'expirationDate', e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>

                        {result.signatures && !result.signatures.is_fully_signed && (
                          <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                            <PenTool className="w-3 h-3" />
                            {result.signatures.count === 0 
                              ? 'Documento sem assinaturas' 
                              : `Apenas ${result.signatures.count} assinatura(s) - pode estar incompleto`}
                          </p>
                        )}

                        {!result.hasValidity && (
                          <p className="text-amber-600 dark:text-amber-400 text-xs flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Sem validade definida - não será salvo
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {result.error || 'Erro ao processar'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep('upload');
                  setResults([]);
                }}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiles([])}
                className="flex-1"
              >
                <Upload className="w-3 h-3 mr-1" />
                Adicionar mais
              </Button>
            </div>

            {validResults.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {validResults.filter(r => r.isUpdate).length > 0 
                  ? `${validResults.filter(r => !r.isUpdate).length} novo(s), ${validResults.filter(r => r.isUpdate).length} atualização(ões) ao salvar`
                  : `${validResults.length} documento(s) serão salvos ao cadastrar o funcionário`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentPackScannerInline;
