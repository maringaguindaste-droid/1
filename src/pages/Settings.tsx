import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatCNPJ } from "@/lib/validations";

type SettingsFormData = {
  company_name: string;
  cnpj: string;
  notification_email: string;
  expiration_alert_days: number;
  max_upload_size_mb: number;
};

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string>("");
  const { register, handleSubmit, setValue } = useForm<SettingsFormData>();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettingsId(data.id);
        Object.keys(data).forEach((key) => {
          setValue(key as keyof SettingsFormData, data[key]);
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar configurações",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("company_settings")
        .update(data)
        .eq("id", settingsId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configurações atualizadas com sucesso!",
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

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Sistema</CardTitle>
          <CardDescription>
            Configure as informações da empresa e parâmetros do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Informações da Empresa</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company_name">Razão Social *</Label>
                  <Input
                    id="company_name"
                    {...register("company_name", { required: true })}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div>
                  <Label htmlFor="cnpj">CNPJ *</Label>
                  <Input
                    id="cnpj"
                    {...register("cnpj", { required: true })}
                    placeholder="00.000.000/0000-00"
                    onChange={(e) => {
                      const formatted = formatCNPJ(e.target.value);
                      setValue("cnpj", formatted);
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="notification_email">Email para Notificações</Label>
                  <Input
                    id="notification_email"
                    type="email"
                    {...register("notification_email")}
                    placeholder="email@empresa.com"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Parâmetros do Sistema</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expiration_alert_days">
                    Dias de Antecedência para Alerta de Vencimento
                  </Label>
                  <Input
                    id="expiration_alert_days"
                    type="number"
                    {...register("expiration_alert_days")}
                    placeholder="30"
                    min="1"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Alertar quando documentos estiverem para vencer
                  </p>
                </div>
                <div>
                  <Label htmlFor="max_upload_size_mb">
                    Tamanho Máximo de Upload (MB)
                  </Label>
                  <Input
                    id="max_upload_size_mb"
                    type="number"
                    {...register("max_upload_size_mb")}
                    placeholder="10"
                    min="1"
                    max="50"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Tamanho máximo permitido para arquivos
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Configurações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
