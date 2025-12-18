import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Bell, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";

export const MobileBottomNav = () => {
  const { user, isAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const location = useLocation();

  if (!user) return null;

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/employees", label: "Funcionários", icon: Users },
    { href: "/documents", label: "Documentos", icon: FileText },
    { href: "/notifications", label: "Alertas", icon: Bell, badge: unreadCount },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t safe-area-pb">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[60px] relative ${
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge && item.badge > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
