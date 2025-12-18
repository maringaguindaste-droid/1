import { ReactNode, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, Users, FileText, LayoutDashboard, FolderOpen, Bell, Menu, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { CompanySelector } from "./CompanySelector";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileBottomNav } from "./MobileBottomNav";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
    { href: "/employees", label: "Funcionarios", icon: Users, adminOnly: false }, // Gerentes também podem ver
    { href: "/documents", label: "Documentos", icon: FileText, adminOnly: false },
    { href: "/document-types", label: "Tipos de Documentos", icon: FolderOpen, adminOnly: true },
    { href: "/notifications", label: "Notificacoes", icon: Bell, adminOnly: false },
    { href: "/admin", label: "Painel Admin", icon: Settings, adminOnly: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-foreground">Portal do Fornecedor</h1>
              <p className="text-xs text-muted-foreground">Sistema de Gestao</p>
            </div>
          </div>

          {/* Company Selector - Center */}
          {user && (
            <div className="hidden md:flex">
              <CompanySelector />
            </div>
          )}

          <div className="flex items-center gap-2">
            {user && (
              <>
                <NotificationBell />
                <ThemeToggle />
                <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-md">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span className="text-sm font-medium truncate max-w-[150px]">{user.email}</span>
                  {isAdmin && (
                    <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={signOut} className="hidden md:flex">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
                
                {/* Mobile Menu Button */}
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                    <nav className="flex flex-col gap-4 mt-8">
                      <div className="flex flex-col gap-2 pb-4 border-b">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-success rounded-full"></div>
                          <span className="text-sm font-medium">{user.email}</span>
                        </div>
                        {isAdmin && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full w-fit">
                            Admin
                          </span>
                        )}
                      </div>

                      {/* Mobile Company Selector */}
                      <div className="pb-4 border-b">
                        <CompanySelector />
                      </div>
                      
                      {navItems.map((item) => {
                        if (item.adminOnly && !isAdmin) return null;
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        
                        return (
                          <Link 
                            key={item.href} 
                            to={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Button
                              variant={isActive ? "secondary" : "ghost"}
                              className="w-full justify-start"
                            >
                              <Icon className="w-4 h-4 mr-2" />
                              {item.label}
                            </Button>
                          </Link>
                        );
                      })}
                      
                      <Button 
                        variant="outline" 
                        className="w-full justify-start mt-4"
                        onClick={() => {
                          signOut();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sair
                      </Button>
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Navigation - Desktop Only */}
      {user && (
        <nav className="hidden md:block border-b bg-card">
          <div className="container mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto">
              {navItems.map((item) => {
                if (item.adminOnly && !isAdmin) return null;
                
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <Link key={item.href} to={item.href}>
                    <Button
                      variant="ghost"
                      className={`rounded-none border-b-2 ${
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4 md:py-6 pb-20 md:pb-6">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
