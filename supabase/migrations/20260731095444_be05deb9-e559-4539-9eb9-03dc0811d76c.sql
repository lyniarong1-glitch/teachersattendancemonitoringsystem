ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_submitted_by_profiles_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;