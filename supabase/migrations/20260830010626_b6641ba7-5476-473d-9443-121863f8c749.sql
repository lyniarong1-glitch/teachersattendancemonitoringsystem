DROP POLICY IF EXISTS "own role insert" ON public.user_roles;

CREATE POLICY "self insert non privileged role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    role = 'student_assistant'::app_role
    OR (role = 'hr'::app_role AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role = 'hr'::app_role))
  )
);

CREATE TABLE public.hr_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  UNIQUE (user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.hr_access_requests TO authenticated;
GRANT ALL ON public.hr_access_requests TO service_role;

ALTER TABLE public.hr_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request own hr access"
ON public.hr_access_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "read own request, hr reads all"
ON public.hr_access_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'hr'::app_role));

CREATE POLICY "hr decides requests"
ON public.hr_access_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'hr'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'hr'::app_role));

CREATE OR REPLACE FUNCTION public.approve_hr_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'hr'::app_role) THEN
    RAISE EXCEPTION 'Only HR can approve access requests';
  END IF;

  SELECT user_id INTO _target FROM public.hr_access_requests WHERE id = _request_id AND status = 'pending';
  IF _target IS NULL THEN
    RAISE EXCEPTION 'Request not found or already decided';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_target, 'hr'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.hr_access_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_hr_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_hr_request(uuid) TO authenticated;