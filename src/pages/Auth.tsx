import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { CreateAdminUser } from "@/components/CreateAdminUser";
export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    try {
      const {
        data,
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          // Check if any admin exists via secure RPC (bypasses RLS)
          const {
            data: anyAdmin,
            error: adminCheckError
          } = await supabase.rpc('any_admin_exists');
          if (adminCheckError) {
            console.error('Erro ao verificar admins:', adminCheckError);
          }
          if (!anyAdmin) {
            toast.error("Nenhum usuário cadastrado! Crie o administrador primeiro.");
            setShowAdminSetup(true);
            return;
          } else {
            toast.error("Email ou senha incorretos");
            return;
          }
        }
        throw error;
      }
      toast.success("Login realizado com sucesso!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      {showAdminSetup ? <div className="w-full max-w-md space-y-4">
          <CreateAdminUser />
          <Button variant="ghost" className="w-full" onClick={() => setShowAdminSetup(false)}>
            Voltar ao Login
          </Button>
        </div> : <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <Building2 className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Maringa Silos Documentação</CardTitle>
            <CardDescription>
              Sistema de gestão de documentos e funcionários
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="seu@email.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                
              </div>
            </div>

            
            
            <p className="text-xs text-center text-muted-foreground">Feito por Ítalo</p>
          </CardContent>
        </Card>}
    </div>;
}