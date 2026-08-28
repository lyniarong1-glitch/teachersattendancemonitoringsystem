ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS submitted_by_name text,
  ADD COLUMN IF NOT EXISTS submitted_by_id_number text;

UPDATE public.attendance_records ar
SET submitted_by_name = p.full_name,
    submitted_by_id_number = p.id_number
FROM public.profiles p
WHERE p.id = ar.submitted_by AND ar.submitted_by_name IS NULL;

CREATE OR REPLACE FUNCTION public.stamp_submitter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.submitted_by_name IS NULL AND NEW.submitted_by IS NOT NULL THEN
    SELECT p.full_name, p.id_number INTO NEW.submitted_by_name, NEW.submitted_by_id_number
    FROM public.profiles p WHERE p.id = NEW.submitted_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_submitter_on_insert ON public.attendance_records;
CREATE TRIGGER stamp_submitter_on_insert
BEFORE INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.stamp_submitter();

CREATE POLICY "hr reads all roles" ON public.user_roles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'hr'::app_role));