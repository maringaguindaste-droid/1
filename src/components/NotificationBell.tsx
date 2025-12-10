import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/hooks/useNotifications";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const [animate, setAnimate] = useState(false);
  const [previousCount, setPreviousCount] = useState(0);

  const recentNotifications = notifications.slice(0, 5);

  useEffect(() => {
    if (unreadCount > previousCount && previousCount > 0) {
      setAnimate(true);
      // Optional: Play notification sound
      // const audio = new Audio('/notification.mp3');
      // audio.play().catch(() => {});
      
      setTimeout(() => setAnimate(false), 1000);
    }
    setPreviousCount(unreadCount);
  }, [unreadCount, previousCount]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`relative ${animate ? 'animate-pulse' : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs animate-in zoom-in-50"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Notificações</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/notifications')}
            >
              Ver todas
            </Button>
          </div>
          <ScrollArea className="h-[300px]">
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma notificação
              </p>
            ) : (
              <div className="space-y-2">
                {recentNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      notification.read
                        ? "bg-muted/50"
                        : "bg-primary/10 hover:bg-primary/20"
                    }`}
                    onClick={() => !notification.read && markAsRead(notification.id)}
                  >
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(notification.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
};
