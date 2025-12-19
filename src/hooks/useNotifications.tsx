import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCompany } from "@/contexts/CompanyContext";

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  company_id: string | null;
  document_id: string | null;
  employee_id: string | null;
  employee_name?: string | null;
  document_type_name?: string | null;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchNotifications();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Notification change:', payload);
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedCompany]);

  const fetchNotifications = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from("notifications")
        .select(`
          *,
          employees:employee_id(full_name),
          documents:document_id(
            document_types:document_type_id(name)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      // Filter by selected company if one is selected
      if (selectedCompany) {
        query = query.or(`company_id.eq.${selectedCompany.id},company_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // Map to include employee name and document type
        const mappedNotifications: Notification[] = data.map((n: any) => ({
          id: n.id,
          type: n.type,
          message: n.message,
          read: n.read,
          created_at: n.created_at,
          company_id: n.company_id,
          document_id: n.document_id,
          employee_id: n.employee_id,
          employee_name: n.employees?.full_name || null,
          document_type_name: n.documents?.document_types?.name || null,
        }));
        setNotifications(mappedNotifications);
        setUnreadCount(mappedNotifications.filter(n => !n.read).length);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);

      if (error) throw error;
      await fetchNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      // Only mark as read for selected company
      if (selectedCompany) {
        query = query.or(`company_id.eq.${selectedCompany.id},company_id.is.null`);
      }

      const { error } = await query;

      if (error) throw error;
      await fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;
      await fetchNotifications();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: fetchNotifications
  };
};
