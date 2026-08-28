DO $$
DECLARE
  bshm_id uuid := '850d02b1-2fb0-4f8e-88e3-9221aefc15f2';
  ite_id  uuid := 'a1129e83-2b1d-4541-9917-a3db8c0069c6';
BEGIN
  -- BSHM roster: insert requested names only if not already present
  INSERT INTO public.teachers (full_name, department_id)
  SELECT v.name, bshm_id
  FROM (VALUES
    ('Ian Jay Pabi'),
    ('Janes Ote'),
    ('Jay Anne Lihayhay'),
    ('Joeliza Elepante'),
    ('Jolaiza Madraza'),
    ('Jovelyn Mebrano'),
    ('Lorejen Salise'),
    ('Maricon Sero'),
    ('Micah Tulod'),
    ('Steven John Maeda'),
    ('Tiffany Sweet Cayapos'),
    ('Vengie Fulguerimas'),
    ('Welvin Orantes')
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.full_name = v.name AND t.department_id = bshm_id
  );

  -- Update existing partial "Steven John" to full name
  UPDATE public.teachers
  SET full_name = 'Steven John Maeda'
  WHERE department_id = bshm_id AND full_name = 'Steven John';

  -- ITE roster: insert requested names only if not already present
  INSERT INTO public.teachers (full_name, department_id)
  SELECT v.name, ite_id
  FROM (VALUES
    ('EDEN C. BUTIONG'),
    ('ERWIN P. ACEDILLO, LPT, MIT'),
    ('JESARYLL N. VALDERAS'),
    ('SER JAMIER L. LLEGO, LPT, MIT')
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.teachers t
    WHERE t.full_name = v.name AND t.department_id = ite_id
  );

  -- Remove Anthony Cruz from ITE
  DELETE FROM public.teachers
  WHERE department_id = ite_id AND full_name = 'Mark Anthony Cruz';
END $$;