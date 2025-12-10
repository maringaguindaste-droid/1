import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isAdmin, loading, roleLoading } = useAuth();
  const navigate = useNavigate();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Wait for BOTH session AND role to finish loading
    if (loading || roleLoading) return;

    // Mark as checked
    setHasChecked(true);

    // If no user, redirect to login
    if (!user) {
      navigate("/auth");
      return;
    }

    // If requires admin and user is not admin, redirect to dashboard
    if (requireAdmin && !isAdmin) {
      toast.error("Acesso negado. Apenas administradores podem acessar esta área.");
      navigate("/dashboard");
      return;
    }
  }, [user, isAdmin, loading, roleLoading, requireAdmin, navigate]);

  // Show loading while checking auth
  if (loading || roleLoading || !hasChecked) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // If no user after loading, don't render (will redirect)
  if (!user) {
    return null;
  }

  // If requires admin and not admin, don't render (will redirect)
  if (requireAdmin && !isAdmin) {
    return null;
  }

  // All checks passed, render children
  return <>{children}</>;
}
