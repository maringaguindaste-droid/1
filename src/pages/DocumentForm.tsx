import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStorage } from "@/hooks/useStorage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, File, Camera } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { DocumentScannerForForm } from "@/components/DocumentScannerForForm";

type DocumentFormData = {
  document_type_id: string;
  employee_id: string;
  expiration_date: string;
  observations: string;
};

const DocumentForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeIdFromParams = searchParams.get("employeeId");
  const { toast } = useToast();
  const { user } = useAuth();
  const { uploadFile, uploading, uploadProgress } = useStorage();
  const [loading, setLoading] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string>("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const { register, handleSubmit, setValue, watch } = useForm<DocumentFormData>();

  const isEditMode = !!id;

  useEffect(() => {
    fetchDocumentTypes();
    fetchEmployees();
    fetchCompanySettings();
    if (isEditMode) {
      fetchDocument();
    }
  }, [id]);

  const fetchDocumentTypes = async () => {
    const { data } = await supabase
      .from("document_types")
      .select("*")
      .eq("is_active", true)
      .order("code");
    
    if (data) setDocumentTypes(data);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, cpf")
      .eq("status", "ATIVO")
      .order("full_name");
    
    if (data) setEmployees(data);
  };

  useEffect(() => {
    if (employeeIdFromParams && employees.length > 0) {
      const employee = employees.find((emp) => emp.id === employeeIdFromParams);
      if (employee) {
        setValue("employee_id", employee.id);
        setSelectedEmployeeName(`${employee.full_name} - ${employee.cpf}`);
      }
    }
  }, [employeeIdFromParams, employees, setValue]);

  const fetchCompanySettings = async () => {
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .maybeSingle();
    
    if (data) setCompanySettings(data);
  };

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      Object.keys(data).forEach((key) => {
        setValue(key as keyof DocumentFormData, data[key]);
      });

      setPreviewUrl(data.file_path);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviewUrl("");
      }
    }
  };

  const handleScanComplete = (data: {
    documentType?: string;
    expirationDate?: string;
    fileBase64: string;
    fileName: string;
    file: File;
  }) => {
    if (data.documentType) {
      setValue("document_type_id", data.documentType);
    }
    if (data.expirationDate) {
      setValue("expiration_date", data.expirationDate);
    }
    setSelectedFile(data.file);
    if (data.fileBase64.startsWith('data:image')) {
      setPreviewUrl(data.fileBase64);
    }
  };

  const onSubmit = async (data: DocumentFormData) => {
    try {
      setLoading(true);

      if (!selectedFile && !isEditMode) {
        toast({
          title: "Arquivo obrigatório",
          description: "Por favor, selecione um arquivo para upload",
          variant: "destructive",
        });
        return;
      }

      let filePath = previewUrl;

      // Upload file if selected
      if (selectedFile) {
        const timestamp = Date.now();
        const fileName = `${data.employee_id}/${timestamp}-${selectedFile.name}`;
        const uploadResult = await uploadFile(selectedFile, fileName);
        filePath = uploadResult.path;
      }

      const documentData = {
        ...data,
        file_path: filePath,
        file_name: selectedFile?.name || previewUrl.split('/').pop(),
        file_size: selectedFile?.size,
        uploaded_by: user?.id,
        status: 'pending' as const,
      };

      if (isEditMode) {
        const { error } = await supabase
          .from("documents")
          .update(documentData)
          .eq("id", id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Documento atualizado com sucesso!",
        });
      } else {
        const { error } = await supabase
          .from("documents")
          .insert([documentData]);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Documento enviado para aprovação!",
        });
      }

      navigate("/documents");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEditMode) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <DocumentScannerForForm
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanComplete={handleScanComplete}
        documentTypes={documentTypes}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{isEditMode ? "Editar Documento" : "Novo Documento"}</CardTitle>
              <CardDescription>
                Preencha os dados e faça o upload do documento
              </CardDescription>
            </div>
            {!isEditMode && (
              <Button variant="outline" onClick={() => setScannerOpen(true)}>
                <Camera className="w-4 h-4 mr-2" />
                Escanear com IA
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {companySettings && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <p className="text-sm">
                  <strong>Razão Social:</strong> {companySettings.company_name}
                </p>
                <p className="text-sm">
                  <strong>CNPJ:</strong> {companySettings.cnpj}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="document_type_id">Tipo de Documento *</Label>
                <Select
                  onValueChange={(value) => setValue("document_type_id", value)}
                  defaultValue={watch("document_type_id")}
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

              <div>
                <Label htmlFor="employee_id">Funcionário *</Label>
                {employeeIdFromParams ? (
                  <Input
                    id="employee_id_display"
                    value={selectedEmployeeName || "Funcionário selecionado"}
                    disabled
                  />
                ) : (
                  <Select
                    onValueChange={(value) => setValue("employee_id", value)}
                    defaultValue={watch("employee_id")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o funcionário" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name} - {emp.cpf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label htmlFor="expiration_date">Data de Vencimento</Label>
                <Input
                  id="expiration_date"
                  type="date"
                  {...register("expiration_date")}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="observations">Observações</Label>
                <Textarea
                  id="observations"
                  {...register("observations")}
                  placeholder="Observações sobre o documento (máximo 500 caracteres)"
                  maxLength={500}
                  rows={3}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="file">Documento *</Label>
                <div className="mt-2 flex items-center justify-center w-full">
                  <label
                    htmlFor="file"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <>
                          <Loader2 className="w-8 h-8 mb-2 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Enviando... {uploadProgress}%
                          </p>
                        </>
                      ) : selectedFile ? (
                        <>
                          <File className="w-8 h-8 mb-2 text-primary" />
                          <p className="text-sm text-foreground">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                          <p className="mb-2 text-sm text-muted-foreground">
                            <span className="font-semibold">Clique para fazer upload</span> ou arraste
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PDF, PNG, JPG, ZIP ou XPS (máx. 10MB)
                          </p>
                        </>
                      )}
                    </div>
                    <Input
                      id="file"
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.zip,.xps"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              {previewUrl && previewUrl.startsWith('data:image') && (
                <div className="md:col-span-2">
                  <Label>Prévia</Label>
                  <div className="mt-2 border rounded-lg p-4">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-w-full h-auto max-h-64 mx-auto"
                    />
                  </div>
                </div>
              )}

              {user && (
                <div className="md:col-span-2 p-4 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Postado por:</strong> {user.email} - {formatDate(new Date().toISOString(), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/documents")}
                disabled={loading || uploading}
              >
                Fechar
              </Button>
              <Button type="submit" disabled={loading || uploading}>
                {(loading || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditMode ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentForm;
