INSERT INTO public.departments (name)
SELECT 'ITE' WHERE NOT EXISTS (SELECT 1 FROM public.departments WHERE name = 'ITE');

INSERT INTO public.teachers (full_name, department_id)
SELECT v.full_name, d.id
FROM public.departments d
CROSS JOIN (VALUES
  ('ERWIN P. ACEDILLO, LPT, MIT'),
  ('EDEN C. BUTIONG'),
  ('SER JAMIER L. LLEGO, LPT, MIT'),
  ('JESARYLL N. VALDERAS')
) AS v(full_name)
WHERE d.name = 'ITE'
  AND NOT EXISTS (
    SELECT 1 FROM public.teachers t WHERE t.full_name = v.full_name AND t.department_id = d.id
  );