CREATE TABLE public.submission_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name text,
  department_id uuid REFERENCES public.departments(id),
  department_name text,
  record_count integer NOT NULL DEFAULT 0,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.submission_notifications TO authenticated;
GRANT ALL ON public.submission_notifications TO service_role;

ALTER TABLE public.submission_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa inserts own notification" ON public.submission_notifications
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND has_role(auth.uid(), 'student_assistant'::app_role));

CREATE POLICY "sa reads own, hr reads all" ON public.submission_notifications
  FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR has_role(auth.uid(), 'hr'::app_role));

CREATE POLICY "hr marks read" ON public.submission_notifications
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

CREATE INDEX submission_notifications_submitted_at_idx ON public.submission_notifications (submitted_at DESC);