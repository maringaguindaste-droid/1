import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { validateCPF, formatCPF, formatPhone, formatCEP } from "@/lib/validations";
import { Loader2, Building2, Camera } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import DocumentScanner from "@/components/DocumentScanner";

type EmployeeFormData = {
  full_name: string;
  rg: string;
  cpf: string;
  birth_date: string;
  cep: string;
  municipality: string;
  neighborhood: string;
  address: string;
  phone: string;
  mobile: string;
  email: string;
  position: string;
  company_name: string;
  company_cnpj: string;
  company_id: string;
  admission_date: string;
  validation_date: string;
  responsible_function: string;
  status: string;
  work_location: string;
  observations: string;
  is_owner: boolean;
};

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
}

const parseDateToISO = (value?: string | null) => {
  if (!value) return "";
  // Se vier no formato dd/mm/aaaa converte para yyyy-mm-dd
  const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m}-${d}`;
  }
  return value;
};

const EmployeeForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedCompany, companies } = useCompany();
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingAddress, setFetchingAddress] = useState(false);
  const [createSystemAccess, setCreateSystemAccess] = useState(false);
  const [systemPassword, setSystemPassword] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<string[]>([]);
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<EmployeeFormData>();

  const handleScannedData = (data: {
    full_name?: string | null;
    cpf?: string | null;
    rg?: string | null;
    birth_date?: string | null;
    cep?: string | null;
    municipality?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    phone?: string | null;
    mobile?: string | null;
    email?: string | null;
    position?: string | null;
    admission_date?: string | null;
    validation_date?: string | null;
    company_name?: string | null;
    company_cnpj?: string | null;
    responsible_function?: string | null;
  }) => {
    const fieldsUpdated: string[] = [];
    
    if (data.full_name) {
      setValue("full_name", data.full_name);
      fieldsUpdated.push("full_name");
    }
    if (data.cpf) {
      const formattedCPF = formatCPF(data.cpf.replace(/\D/g, ''));
      setValue("cpf", formattedCPF);
      fieldsUpdated.push("cpf");
    }
    if (data.rg) {
      setValue("rg", data.rg);
      fieldsUpdated.push("rg");
    }
    if (data.birth_date) {
      setValue("birth_date", parseDateToISO(data.birth_date));
      fieldsUpdated.push("birth_date");
    }
    if (data.cep) {
      const formattedCEP = formatCEP(data.cep);
      setValue("cep", formattedCEP);
      fieldsUpdated.push("cep");
      if (formattedCEP.replace(/[^\d]/g, '').length === 8) {
        fetchAddressByCEP(formattedCEP);
      }
    }
    if (data.municipality) {
      setValue("municipality", data.municipality);
      fieldsUpdated.push("municipality");
    }
    if (data.neighborhood) {
      setValue("neighborhood", data.neighborhood);
      fieldsUpdated.push("neighborhood");
    }
    if (data.address) {
      setValue("address", data.address);
      fieldsUpdated.push("address");
    }
    if (data.phone) {
      const formatted = formatPhone(data.phone);
      setValue("phone", formatted);
      fieldsUpdated.push("phone");
    }
    if (data.mobile) {
      const formatted = formatPhone(data.mobile);
      setValue("mobile", formatted);
      fieldsUpdated.push("mobile");
    }
    if (data.email) {
      setValue("email", data.email);
      fieldsUpdated.push("email");
    }
    if (data.position) {
      setValue("position", data.position);
      fieldsUpdated.push("position");
    }
    if (data.admission_date) {
      setValue("admission_date", parseDateToISO(data.admission_date));
      fieldsUpdated.push("admission_date");
    }
    if (data.validation_date) {
      setValue("validation_date", parseDateToISO(data.validation_date));
      fieldsUpdated.push("validation_date");
    }
    if (data.responsible_function) {
      setValue("responsible_function", data.responsible_function);
      fieldsUpdated.push("responsible_function");
    }
    if (data.company_name) {
      setValue("company_name", data.company_name);
      fieldsUpdated.push("company_name");
    }
    if (data.company_cnpj) {
      setValue("company_cnpj", data.company_cnpj);
      fieldsUpdated.push("company_cnpj");
    }
    // Tentar mapear empresa por CNPJ ou nome
    if ((data.company_cnpj || data.company_name) && allCompanies.length > 0) {
      const matchedCompany = allCompanies.find((c) =>
        (data.company_cnpj && c.cnpj === data.company_cnpj) ||
        (data.company_name && c.name.toLowerCase().includes(data.company_name.toLowerCase()))
      );
      if (matchedCompany) {
        setValue("company_id", matchedCompany.id);
        setValue("company_name", matchedCompany.name);
        setValue("company_cnpj", matchedCompany.cnpj || "");
        fieldsUpdated.push("company_id");
      }
    }
    
    setHighlightedFields(fieldsUpdated);
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedFields([]);
    }, 3000);
  };

  const selectedCompanyId = watch("company_id");

  const isEditMode = !!id;

  useEffect(() => {
    fetchCompanies();
    if (isEditMode) {
      fetchEmployee();
    } else if (selectedCompany) {
      setValue("company_id", selectedCompany.id);
      setValue("company_name", selectedCompany.name);
    }
  }, [id, selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, cnpj")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setAllCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const fetchEmployee = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // Populate form with existing data
      Object.keys(data).forEach((key) => {
        setValue(key as keyof EmployeeFormData, data[key]);
      });
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

  const fetchAddressByCEP = async (cep: string) => {
    const cleanCEP = cep.replace(/[^\d]/g, '');
    if (cleanCEP.length !== 8) return;

    try {
      setFetchingAddress(true);
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          description: "Verifique o CEP digitado",
          variant: "destructive",
        });
        return;
      }

      setValue("address", data.logradouro);
      setValue("neighborhood", data.bairro);
      setValue("municipality", data.localidade);
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: "Não foi possível buscar o endereço",
        variant: "destructive",
      });
    } finally {
      setFetchingAddress(false);
    }
  };

  const onSubmit = async (data: EmployeeFormData) => {
    try {
      setLoading(true);

      // Validate CPF
      if (!validateCPF(data.cpf)) {
        toast({
          title: "CPF inválido",
          description: "Por favor, digite um CPF válido",
          variant: "destructive",
        });
        return;
      }

      // Check CPF uniqueness
      const { data: existingEmployee } = await supabase
        .from("employees")
        .select("id")
        .eq("cpf", data.cpf)
        .neq("id", id || "")
        .maybeSingle();

      if (existingEmployee) {
        toast({
          title: "CPF já cadastrado",
          description: "Já existe um funcionário com este CPF",
          variant: "destructive",
        });
        return;
      }

      let redirectTo = "/employees";

      if (isEditMode) {
        const { error } = await supabase
          .from("employees")
          .update(data)
          .eq("id", id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Funcionário atualizado com sucesso!",
        });
      } else {
        let userId = null;

        // Create system access if requested
        if (createSystemAccess && data.email && systemPassword) {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: systemPassword,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
              data: {
                full_name: data.full_name,
              }
            }
          });

          if (authError) throw authError;
          userId = authData.user?.id;

          // Create employee role
          if (userId) {
            const { error: roleError } = await supabase
              .from("user_roles")
              .insert([{ user_id: userId, role: "employee" }]);

            if (roleError) throw roleError;

            // Associate user with the selected company
            if (data.company_id) {
              const { error: companyError } = await supabase
                .from("user_companies")
                .insert([{ 
                  user_id: userId, 
                  company_id: data.company_id,
                  is_default: true 
                }]);

              if (companyError) throw companyError;
            }
          }
        }

        const { data: newEmployee, error } = await supabase
          .from("employees")
          .insert([{ ...data, user_id: userId }])
          .select("id")
          .single();

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: createSystemAccess 
            ? "Funcionário cadastrado com acesso ao sistema!" 
            : "Funcionário cadastrado com sucesso!",
        });

        if (newEmployee?.id) {
          redirectTo = `/documents/new?employeeId=${newEmployee.id}`;
        }
      }

      navigate(redirectTo);
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
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? "Editar Funcionário" : "Novo Funcionário"}</CardTitle>
          <CardDescription>
            Preencha todos os campos obrigatórios marcados com *
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dados" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados do Funcionário</TabsTrigger>
              <TabsTrigger value="documentos" disabled={!isEditMode}>
                Documentos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Identificação</h3>
                    {!isEditMode && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setScannerOpen(true)}
                        className="gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Escanear Documento
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="full_name">Nome Completo *</Label>
                      <Input
                        id="full_name"
                        {...register("full_name", { required: true })}
                        placeholder="Nome completo do funcionário"
                        className={highlightedFields.includes("full_name") ? "ring-2 ring-green-500 border-green-500" : ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="rg">RG *</Label>
                      <Input
                        id="rg"
                        {...register("rg", { required: true })}
                        placeholder="00.000.000-0"
                        className={highlightedFields.includes("rg") ? "ring-2 ring-green-500 border-green-500" : ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cpf">CPF *</Label>
                      <Input
                        id="cpf"
                        {...register("cpf", { required: true })}
                        placeholder="000.000.000-00"
                        className={highlightedFields.includes("cpf") ? "ring-2 ring-green-500 border-green-500" : ""}
                        onChange={(e) => {
                          const formatted = formatCPF(e.target.value);
                          setValue("cpf", formatted);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="birth_date">Data de Nascimento</Label>
                      <Input
                        id="birth_date"
                        type="date"
                        {...register("birth_date")}
                        className={highlightedFields.includes("birth_date") ? "ring-2 ring-green-500 border-green-500" : ""}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Endereço</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="cep">CEP</Label>
                      <Input
                        id="cep"
                        {...register("cep")}
                        placeholder="00000-000"
                        onChange={(e) => {
                          const formatted = formatCEP(e.target.value);
                          setValue("cep", formatted);
                          if (formatted.replace(/[^\d]/g, '').length === 8) {
                            fetchAddressByCEP(formatted);
                          }
                        }}
                      />
                      {fetchingAddress && <p className="text-sm text-muted-foreground">Buscando...</p>}
                    </div>
                    <div>
                      <Label htmlFor="municipality">Município</Label>
                      <Input
                        id="municipality"
                        {...register("municipality")}
                        placeholder="Cidade"
                      />
                    </div>
                    <div>
                      <Label htmlFor="neighborhood">Bairro</Label>
                      <Input
                        id="neighborhood"
                        {...register("neighborhood")}
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Label htmlFor="address">Endereço Completo</Label>
                      <Input
                        id="address"
                        {...register("address")}
                        placeholder="Rua, número, complemento"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Contato</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        {...register("phone")}
                        placeholder="(00) 0000-0000"
                        onChange={(e) => {
                          const formatted = formatPhone(e.target.value);
                          setValue("phone", formatted);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobile">Celular</Label>
                      <Input
                        id="mobile"
                        {...register("mobile")}
                        placeholder="(00) 00000-0000"
                        onChange={(e) => {
                          const formatted = formatPhone(e.target.value);
                          setValue("mobile", formatted);
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        {...register("email")}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary" />
                    Dados Profissionais
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="company_id">Empresa *</Label>
                      <Select
                        value={selectedCompanyId}
                        onValueChange={(value) => {
                          setValue("company_id", value);
                          const company = allCompanies.find(c => c.id === value);
                          if (company) {
                            setValue("company_name", company.name);
                            setValue("company_cnpj", company.cnpj || "");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          {allCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="position">Cargo *</Label>
                      <Input
                        id="position"
                        {...register("position", { required: true })}
                        placeholder="Cargo do funcionário"
                      />
                    </div>
                    <div>
                      <Label htmlFor="company_name">Nome da Empresa</Label>
                      <Input
                        id="company_name"
                        {...register("company_name")}
                        placeholder="Razão social"
                        disabled
                      />
                    </div>
                    <div>
                      <Label htmlFor="company_cnpj">CNPJ da Empresa</Label>
                      <Input
                        id="company_cnpj"
                        {...register("company_cnpj")}
                        placeholder="00.000.000/0000-00"
                        disabled
                      />
                    </div>
                    <div>
                      <Label htmlFor="admission_date">Data de Admissão</Label>
                      <Input
                        id="admission_date"
                        type="date"
                        {...register("admission_date")}
                      />
                    </div>
                    <div>
                      <Label htmlFor="validation_date">Data de Validação</Label>
                      <Input
                        id="validation_date"
                        type="date"
                        {...register("validation_date")}
                      />
                    </div>
                    <div>
                      <Label htmlFor="responsible_function">Função Responsável</Label>
                      <Input
                        id="responsible_function"
                        {...register("responsible_function")}
                        placeholder="Função"
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Situação</Label>
                      <Select
                        onValueChange={(value) => setValue("status", value)}
                        defaultValue={watch("status") || "ATIVO"}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ATIVO">ATIVO</SelectItem>
                          <SelectItem value="INATIVO">INATIVO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="work_location">Local da Obra</Label>
                      <Input
                        id="work_location"
                        {...register("work_location")}
                        placeholder="Local de trabalho"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="observations">Observações</Label>
                      <Textarea
                        id="observations"
                        {...register("observations")}
                        placeholder="Observações adicionais"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                {!isEditMode && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Acesso ao Sistema</h3>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="create_system_access"
                        checked={createSystemAccess}
                        onCheckedChange={setCreateSystemAccess}
                      />
                      <Label htmlFor="create_system_access">Criar acesso ao sistema para este funcionário</Label>
                    </div>
                    
                    {createSystemAccess && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="md:col-span-2">
                          <p className="text-sm text-muted-foreground mb-4">
                            O funcionário poderá fazer login com o email cadastrado acima e visualizar seus próprios documentos.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="system_password">Senha *</Label>
                          <Input
                            id="system_password"
                            type="password"
                            value={systemPassword}
                            onChange={(e) => setSystemPassword(e.target.value)}
                            placeholder="Senha de acesso ao sistema"
                            required={createSystemAccess}
                          />
                        </div>
                        <div>
                          <Label htmlFor="confirm_password">Confirmar Senha *</Label>
                          <Input
                            id="confirm_password"
                            type="password"
                            placeholder="Repita a senha"
                            required={createSystemAccess}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end space-x-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/employees")}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditMode ? "Atualizar" : "Cadastrar"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="documentos">
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Salve o funcionário primeiro para adicionar documentos
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <DocumentScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDataExtracted={handleScannedData}
      />
    </div>
  );
};

export default EmployeeForm;
