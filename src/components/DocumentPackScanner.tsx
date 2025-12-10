import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Trash2,
  Save,
  User,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Calculator,
  Plus
} from "lucide-react";

interface ScannedDocument {
  fileName: string;
  fileBase64?: string;
  mimeType?: string;
  success: boolean;
  error?: string;
  document_type_code?: string;
  document_type_name?: string;
  expiration_date?: string | null;
  emission_date?: string | null;
  observations?: string | null;
  confidence?: number;
  selectedDocumentTypeId?: string;
  dateAutoCalculated?: boolean;
  validityYears?: number;
  hasNoValidity?: boolean;
}

interface Employee {
  id: string;
  full_name: string;
  cpf: string;
}

interface DocumentType {
  id: string;
  name: string;
  code: string;
  default_validity_years: number | null;
}

interface DocumentPackScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function DocumentPackScanner({ open, onOpenChange, onComplete }: DocumentPackScannerProps) {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [files, setFiles] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<ScannedDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [step, setStep] = useState<'select-employee' | 'upload' | 'review'>('select-employee');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);

  // Fetch employees when dialog opens
  useEffect(() => {
    if (open) {
      fetchEmployeesAndTypes();
    }
  }, [open, selectedCompany]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf']
    },
    multiple: true
  });

  const fetchEmployeesAndTypes = async () => {
    try {
      let empQuery = supabase
        .from("employees")
        .select("id, full_name, cpf")
        .eq("status", "ATIVO")
        .order("full_name");
      
      if (selectedCompany) {
        empQuery = empQuery.eq("company_id", selectedCompany.id);
      }
      
      const { data: empData } = await empQuery;
      setEmployees(empData || []);

      const { data: typesData } = await supabase
        .from("document_types")
        .select("id, name, code, default_validity_years")
        .eq("is_active", true)
        .order("name");
      
      setDocumentTypes(typesData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setSelectedFiles(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  const removeSelectedFiles = () => {
    setFiles(prev => prev.filter((_, i) => !selectedFiles.includes(i)));
    setSelectedFiles([]);
  };

  const toggleFileSelection = (index: number) => {
    setSelectedFiles(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleAllFiles = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(files.map((_, i) => i));
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Função para mapear código da IA para tipo de documento no banco
  const findMatchingDocumentType = (result: ScannedDocument): DocumentType | undefined => {
    const code = result.document_type_code?.toUpperCase() || '';
    const name = result.document_type_name?.toLowerCase() || '';

    // 1. Buscar por código exato
    let matched = documentTypes.find(dt => dt.code.toUpperCase() === code);
    if (matched) return matched;

    // 2. Buscar por NR no código (ex: NR35 -> buscar tipo que contém NR35 no nome)
    if (code.startsWith('NR')) {
      matched = documentTypes.find(dt => 
        dt.code.toUpperCase() === code ||
        dt.name.toUpperCase().includes(code)
      );
      if (matched) return matched;
    }

    // 3. Buscar pelo nome completo
    matched = documentTypes.find(dt => 
      dt.name.toLowerCase().includes(name) ||
      name.includes(dt.name.toLowerCase())
    );
    if (matched) return matched;

    // 4. Buscar por palavras-chave
    const keywords: Record<string, string[]> = {
      'ASO': ['aso', 'atestado', 'saúde ocupacional'],
      'CNH': ['cnh', 'habilitação', 'carteira de motorista'],
      'CTPS': ['ctps', 'carteira de trabalho'],
      'RG': ['rg', 'identidade', 'registro geral'],
      'CPF': ['cpf', 'cadastro pessoa'],
    };

    for (const [typeCode, words] of Object.entries(keywords)) {
      if (words.some(w => name.includes(w) || code.toLowerCase().includes(w))) {
        matched = documentTypes.find(dt => dt.code.toUpperCase() === typeCode);
        if (matched) return matched;
      }
    }

    return undefined;
  };

  // Função para calcular data de validade
  const calculateExpirationDate = (
    result: ScannedDocument, 
    matchedType: DocumentType | undefined
  ): { date: string | null; autoCalculated: boolean; validityYears: number | null; hasNoValidity: boolean } => {
    const validityYears = matchedType?.default_validity_years || null;

    // 1. Se tem data de validade explícita da IA, usar ela
    if (result.expiration_date) {
      return { 
        date: result.expiration_date, 
        autoCalculated: false, 
        validityYears,
        hasNoValidity: false
      };
    }

    // 2. Se não tem validade padrão, documento não tem validade
    if (!validityYears) {
      return { 
        date: null, 
        autoCalculated: false, 
        validityYears: null,
        hasNoValidity: true
      };
    }

    // 3. Se tem data de emissão + validade padrão, calcular
    if (result.emission_date && validityYears) {
      const emissionDate = new Date(result.emission_date);
      emissionDate.setFullYear(emissionDate.getFullYear() + validityYears);
      emissionDate.setDate(emissionDate.getDate() - 1);
      return { 
        date: emissionDate.toISOString().split('T')[0], 
        autoCalculated: true, 
        validityYears,
        hasNoValidity: false
      };
    }

    // 4. Se só tem validade padrão, calcular a partir de hoje
    if (validityYears) {
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + validityYears);
      expirationDate.setDate(expirationDate.getDate() - 1);
      return { 
        date: expirationDate.toISOString().split('T')[0], 
        autoCalculated: true, 
        validityYears,
        hasNoValidity: false
      };
    }

    return { date: null, autoCalculated: false, validityYears: null, hasNoValidity: true };
  };

  // Função para criar tipo de documento automaticamente
  const createDocumentType = async (code: string, name: string): Promise<DocumentType | null> => {
    try {
      const { data, error } = await supabase
        .from('document_types')
        .insert({
          code: code.toUpperCase(),
          name: name || code,
          description: `Tipo criado automaticamente pelo scanner`,
          default_validity_years: null,
          is_active: true,
          company_id: selectedCompany?.id || null
        })
        .select('id, name, code, default_validity_years')
        .single();

      if (error) {
        console.error('Erro ao criar tipo de documento:', error);
        return null;
      }

      // Adicionar ao estado local
      setDocumentTypes(prev => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Erro ao criar tipo de documento:', error);
      return null;
    }
  };

  const handleScan = async () => {
    if (files.length === 0) {
      toast.error("Selecione pelo menos um arquivo");
      return;
    }

    setScanning(true);

    try {
      const filesData = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          base64: await convertToBase64(file),
          mimeType: file.type
        }))
      );

      toast.info(`Analisando ${files.length} documento(s) com IA...`);

      const { data, error } = await supabase.functions.invoke('scan-document-pack', {
        body: { files: filesData }
      });

      if (error) throw error;

      if (data.success) {
        const enhancedResults: ScannedDocument[] = [];

        for (const result of data.results) {
          if (result.success) {
            // Mapear tipo de documento
            let matchedType = findMatchingDocumentType(result);

            // Se não encontrou e tem código, criar automaticamente
            if (!matchedType && result.document_type_code && result.document_type_code !== 'OUTRO') {
              toast.info(`Criando tipo: ${result.document_type_name || result.document_type_code}`);
              matchedType = await createDocumentType(
                result.document_type_code, 
                result.document_type_name || result.document_type_code
              );
            }

            // Calcular data de validade
            const { date, autoCalculated, validityYears, hasNoValidity } = calculateExpirationDate(result, matchedType);

            enhancedResults.push({
              ...result,
              selectedDocumentTypeId: matchedType?.id || '',
              expiration_date: date,
              dateAutoCalculated: autoCalculated,
              validityYears,
              hasNoValidity
            });
          } else {
            enhancedResults.push(result);
          }
        }

        setResults(enhancedResults);
        setStep('review');
        
        // Contar documentos válidos (com data de validade)
        const validCount = enhancedResults.filter(r => r.success && r.expiration_date).length;
        const noValidityCount = enhancedResults.filter(r => r.success && r.hasNoValidity).length;
        
        toast.success(`${data.processed}/${data.total} analisado(s). ${validCount} com validade, ${noValidityCount} sem validade.`);
      } else {
        throw new Error(data.error || 'Erro ao analisar documentos');
      }
    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error(error.message || "Erro ao escanear documentos");
    } finally {
      setScanning(false);
    }
  };

  const updateResult = (index: number, updates: Partial<ScannedDocument>) => {
    setResults(prev => prev.map((r, i) => {
      if (i !== index) return r;
      
      const updated = { ...r, ...updates };
      
      // Se mudou o tipo de documento, recalcular validade
      if (updates.selectedDocumentTypeId && updates.selectedDocumentTypeId !== r.selectedDocumentTypeId) {
        const newType = documentTypes.find(dt => dt.id === updates.selectedDocumentTypeId);
        const { date, autoCalculated, validityYears, hasNoValidity } = calculateExpirationDate(
          { ...r, expiration_date: null }, // Forçar recálculo
          newType
        );
        
        // Só atualizar se não tinha data explícita da IA
        if (!r.expiration_date || r.dateAutoCalculated) {
          updated.expiration_date = date;
          updated.dateAutoCalculated = autoCalculated;
          updated.validityYears = validityYears;
          updated.hasNoValidity = hasNoValidity;
        }
      }
      
      return updated;
    }));
  };

  const removeResult = (index: number) => {
    setResults(prev => prev.filter((_, i) => i !== index));
  };

  // Função para sanitizar nome do arquivo (remover acentos e espaços)
  const sanitizeFileName = (fileName: string): string => {
    const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_.-]/g, '');
  };

  const handleSaveAll = async () => {
    // Salvar todos os documentos que tem tipo selecionado
    const validResults = results.filter(r => 
      r.success && 
      r.selectedDocumentTypeId
    );

    if (validResults.length === 0) {
      toast.error("Nenhum documento válido para salvar. Selecione o tipo de documento.");
      return;
    }

    setSaving(true);
    let savedCount = 0;

    try {
      for (const result of validResults) {
        const sanitizedFileName = sanitizeFileName(result.fileName);
        const fileName = `${selectedEmployeeId}/${result.selectedDocumentTypeId}/${Date.now()}-${sanitizedFileName}`;
        
        const base64Data = result.fileBase64?.split(',')[1];
        if (!base64Data) continue;
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Determinar MIME type correto
        const mimeType = result.mimeType || 
          (result.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 
           result.fileName.toLowerCase().endsWith('.png') ? 'image/png' : 
           result.fileName.toLowerCase().endsWith('.jpg') || result.fileName.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 
           result.fileName.toLowerCase().endsWith('.webp') ? 'image/webp' :
           'application/pdf');
        
        const blob = new Blob([bytes], { type: mimeType });

        const { error: uploadError } = await supabase.storage
          .from('employee-documents')
          .upload(fileName, blob, {
            contentType: mimeType,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { error: insertError } = await supabase
          .from('documents')
          .insert({
            employee_id: selectedEmployeeId,
            document_type_id: result.selectedDocumentTypeId,
            file_name: result.fileName,
            file_path: fileName,
            expiration_date: result.expiration_date,
            status: 'pending',
            observations: result.observations || null,
            uploaded_by: user?.id
          });

        if (insertError) {
          console.error('Insert error:', insertError);
          continue;
        }

        savedCount++;
      }

      toast.success(`${savedCount} documento(s) salvos com sucesso!`);
      handleClose();
      onComplete();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Erro ao salvar documentos");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setResults([]);
    setStep('select-employee');
    setSelectedEmployeeId('');
    setSelectedFiles([]);
    onOpenChange(false);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  // Contar documentos por status - agora conta todos com tipo selecionado
  const validDocsCount = results.filter(r => r.success && r.selectedDocumentTypeId).length;
  const noValidityDocsCount = results.filter(r => r.success && r.selectedDocumentTypeId && !r.expiration_date).length;
  const errorDocsCount = results.filter(r => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Scanner de Documentos
          </DialogTitle>
          <DialogDescription>
            {step === 'select-employee' && 'Selecione o funcionário para importar os documentos'}
            {step === 'upload' && `Faça upload dos documentos de ${selectedEmployee?.full_name}`}
            {step === 'review' && 'Revise os documentos analisados e confirme as informações'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 py-2 flex-shrink-0">
          <Badge variant={step === 'select-employee' ? 'default' : 'outline'}>1. Funcionário</Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <Badge variant={step === 'upload' ? 'default' : 'outline'}>2. Upload</Badge>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <Badge variant={step === 'review' ? 'default' : 'outline'}>3. Revisão</Badge>
        </div>

        {/* STEP 1: Select Employee */}
        {step === 'select-employee' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="employee-select">Selecione o Funcionário</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger id="employee-select" className="w-full">
                  <SelectValue placeholder="Escolha um funcionário..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{emp.full_name}</span>
                        <span className="text-muted-foreground text-xs">({emp.cpf})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEmployee && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{selectedEmployee.full_name}</p>
                      <p className="text-sm text-muted-foreground">CPF: {selectedEmployee.cpf}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button 
                onClick={() => setStep('upload')} 
                disabled={!selectedEmployeeId}
              >
                Próximo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Upload Files */}
        {step === 'upload' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pb-4">
              {selectedEmployee && (
                <Card className="bg-muted/50">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Importando para: <strong>{selectedEmployee.full_name}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-base font-medium">
                  {isDragActive ? 'Solte os arquivos aqui' : 'Arraste documentos ou clique para selecionar'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Suporta: JPG, PNG, WEBP, PDF (múltiplos arquivos)
                </p>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        checked={selectedFiles.length === files.length && files.length > 0}
                        onCheckedChange={toggleAllFiles}
                      />
                      <Label>Arquivos selecionados ({files.length})</Label>
                    </div>
                    <div className="flex gap-2">
                      {selectedFiles.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={removeSelectedFiles}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remover ({selectedFiles.length})
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setFiles([]); setSelectedFiles([]); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remover todos
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {files.map((file, index) => (
                      <div 
                        key={index} 
                        className={`flex items-center justify-between py-2 px-3 hover:bg-muted/50 ${selectedFiles.includes(index) ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Checkbox 
                            checked={selectedFiles.includes(index)}
                            onCheckedChange={() => toggleFileSelection(index)}
                          />
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => removeFile(index)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-4 border-t flex-shrink-0">
              <Button variant="outline" onClick={() => setStep('select-employee')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleScan} 
                  disabled={files.length === 0 || scanning}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      Analisar Documentos
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Review Results */}
        {step === 'review' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Summary badges */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                {validDocsCount} com validade
              </Badge>
              {noValidityDocsCount > 0 && (
                <Badge variant="secondary" className="bg-yellow-600 text-white">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {noValidityDocsCount} sem validade
                </Badge>
              )}
              {errorDocsCount > 0 && (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  {errorDocsCount} erros
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-3">
                {results.map((result, index) => (
                  <Card 
                    key={index} 
                    className={`${
                      !result.success 
                        ? 'border-destructive/50 bg-destructive/5' 
                        : result.hasNoValidity
                          ? 'border-yellow-500/50 bg-yellow-500/5'
                          : 'border-green-500/30 bg-green-500/5'
                    }`}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              result.hasNoValidity ? (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            <span className="font-medium text-sm">{result.fileName}</span>
                            {result.dateAutoCalculated && (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
                                <Calculator className="w-3 h-3 mr-1" />
                                Calculado +{result.validityYears} ano(s)
                              </Badge>
                            )}
                            {result.hasNoValidity && (
                              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Sem validade
                              </Badge>
                            )}
                          </div>

                          {result.success ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Tipo do Documento</Label>
                                <Select
                                  value={result.selectedDocumentTypeId || ''}
                                  onValueChange={(value) => updateResult(index, { selectedDocumentTypeId: value })}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Selecione o tipo..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {documentTypes.map((type) => (
                                      <SelectItem key={type.id} value={type.id}>
                                        <div className="flex items-center gap-2">
                                          <span>{type.name}</span>
                                          {type.default_validity_years && (
                                            <span className="text-muted-foreground text-xs">
                                              ({type.default_validity_years} ano{type.default_validity_years > 1 ? 's' : ''})
                                            </span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {result.document_type_name && (
                                  <p className="text-xs text-muted-foreground">
                                    IA detectou: {result.document_type_name}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-1">
                                <Label className="text-xs">Data de Validade</Label>
                                <Input
                                  type="date"
                                  value={result.expiration_date || ''}
                                  onChange={(e) => updateResult(index, { 
                                    expiration_date: e.target.value || null,
                                    dateAutoCalculated: false,
                                    hasNoValidity: !e.target.value
                                  })}
                                  className="h-8"
                                />
                                {result.emission_date && (
                                  <p className="text-xs text-muted-foreground">
                                    Data de emissão: {new Date(result.emission_date).toLocaleDateString('pt-BR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-destructive">{result.error}</p>
                          )}

                          {result.observations && (
                            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                              {result.observations}
                            </p>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeResult(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between gap-2 pt-4 border-t flex-shrink-0">
              <Button variant="outline" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveAll} 
                  disabled={validDocsCount === 0 || saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar {validDocsCount} Documento(s)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
