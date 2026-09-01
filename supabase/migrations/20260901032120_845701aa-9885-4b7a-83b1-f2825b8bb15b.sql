ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

UPDATE public.profiles SET approval_status = 'approved', approved_at = now() WHERE approval_status = 'pending';

-- ITE department
UPDATE public.teachers SET full_name = 'Erwin P. Acedillo, LPT, MIT' WHERE full_name = 'ERWIN P. ACEDILLO, LPT, MIT';
UPDATE public.teachers SET full_name = 'Eden C. Butiong' WHERE full_name = 'EDEN C. BUTIONG';
UPDATE public.teachers SET full_name = 'Ser Jamier L. Llegó, LPT, MIT' WHERE full_name = 'SER JAMIER L. LLEGO, LPT, MIT';
UPDATE public.teachers SET full_name = 'Jesaryll N. Valderas' WHERE full_name = 'JESARYLL N. VALDERAS';
DELETE FROM public.teachers t
 WHERE t.full_name IN ('Daniel Villanueva','Sheila Marie Gomez')
   AND NOT EXISTS (SELECT 1 FROM public.attendance_records a WHERE a.teacher_id = t.id);

-- CRIM department
UPDATE public.teachers SET full_name = 'Aimar Mondejar Gerasmio' WHERE full_name = 'Emmanuel Batac';
UPDATE public.teachers SET full_name = 'Amamie O. Angeles' WHERE full_name = 'Fernando Aquino';
UPDATE public.teachers SET full_name = 'Angelica C. Escalon' WHERE full_name = 'Jocelyn Navarro';

INSERT INTO public.teachers (full_name, department_id)
SELECT n, (SELECT id FROM public.departments WHERE name = 'CRIM')
FROM unnest(ARRAY[
  'Atty. Ariston L. Aparri','Atty. Hansel Jan Atmosfera','Atty. Joel Mahinay','Atty. Kindy Mae Pamaos',
  'Atty. Suzette Tan-Atmosfera','Ednar Khae A. Magnanao','Emelita T. Flores','Flora May S. Castro',
  'Hannah May V. Cerbo','James D. Duloy','Justine Gabriel A. Ortega','Lea A. Gorit','Maridel G. Flores',
  'Nicole Ann B. Montenegro','Richard B. Enghog'
]) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.teachers t
  WHERE t.full_name = n AND t.department_id = (SELECT id FROM public.departments WHERE name = 'CRIM')
);