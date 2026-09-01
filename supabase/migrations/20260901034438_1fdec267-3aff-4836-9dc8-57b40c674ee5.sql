ALTER TABLE public.teachers ADD COLUMN is_active boolean NOT NULL DEFAULT true;

GRANT SELECT, UPDATE ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;

UPDATE public.teachers
SET is_active = false
WHERE department_id = (SELECT id FROM public.departments WHERE name = 'ITE')
  AND full_name IN ('Daniel Villanueva', 'Sheila Marie Gomez');