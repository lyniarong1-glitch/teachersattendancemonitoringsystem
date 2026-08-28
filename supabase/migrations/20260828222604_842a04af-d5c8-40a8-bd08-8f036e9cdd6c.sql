ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamp with time zone;

CREATE POLICY "hr updates profile status"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'hr'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'hr'::app_role));

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_submitted_by_fkey,
  DROP CONSTRAINT IF EXISTS attendance_records_submitted_by_profiles_fkey;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_submitted_by_profiles_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.submission_notifications
  DROP CONSTRAINT IF EXISTS submission_notifications_submitted_by_fkey;

ALTER TABLE public.submission_notifications
  ADD CONSTRAINT submission_notifications_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;