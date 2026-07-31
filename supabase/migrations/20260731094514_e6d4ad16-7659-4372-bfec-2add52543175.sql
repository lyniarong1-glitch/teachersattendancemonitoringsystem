CREATE TYPE public.app_role AS ENUM ('student_assistant', 'hr');
CREATE TYPE public.attendance_status AS ENUM ('Present', 'Late', 'Absent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  birthdate date,
  address text,
  email text NOT NULL,
  username text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "own role insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments readable" ON public.departments FOR SELECT TO authenticated USING (true);

CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE
);
GRANT SELECT ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teachers readable" ON public.teachers FOR SELECT TO authenticated USING (true);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  department_id uuid NOT NULL REFERENCES public.departments(id),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  room_assignment text NOT NULL,
  time_arrival time,
  time_out time,
  attendance_status public.attendance_status NOT NULL,
  remarks text,
  date_submitted date NOT NULL DEFAULT CURRENT_DATE,
  time_submitted time NOT NULL DEFAULT CURRENT_TIME,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_edited_by uuid REFERENCES auth.users(id),
  last_edited_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa reads own records" ON public.attendance_records FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'hr'));
CREATE POLICY "sa inserts records" ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND public.has_role(auth.uid(), 'student_assistant'));
CREATE POLICY "hr updates records" ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'hr')) WITH CHECK (public.has_role(auth.uid(), 'hr'));

INSERT INTO public.departments (name) VALUES ('BSHM'),('BSBA'),('CELA'),('ITE'),('CBA'),('CRIM');

INSERT INTO public.teachers (full_name, department_id)
SELECT t.name, d.id FROM (VALUES
  ('Steven John Maeda','BSHM'),
  ('Jay Anne Lihayhay','BSHM'),
  ('Marites Dela Cruz','BSHM'),
  ('Roberto Santiago','BSBA'),
  ('Angelica Ramos','BSBA'),
  ('Kevin Torres','BSBA'),
  ('Maria Elena Reyes','CELA'),
  ('Paolo Mendoza','CELA'),
  ('Christine Bautista','CELA'),
  ('Daniel Villanueva','ITE'),
  ('Sheila Marie Gomez','ITE'),
  ('Mark Anthony Cruz','ITE'),
  ('Lorna Fajardo','CBA'),
  ('Ricardo Salazar','CBA'),
  ('Grace Ann Pineda','CBA'),
  ('Fernando Aquino','CRIM'),
  ('Jocelyn Navarro','CRIM'),
  ('Emmanuel Batac','CRIM')
) AS t(name, dept)
JOIN public.departments d ON d.name = t.dept;