
-- Enable realtime for remaining tables that might not be enabled
DO $$
BEGIN
  -- Try to add profiles (ignore if already exists)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
  
  -- Try to add user_roles (ignore if already exists)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
  
  -- Try to add user_companies (ignore if already exists)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_companies;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
  
  -- Try to add notifications (ignore if already exists)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    -- Already exists, ignore
  END;
END
$$;
