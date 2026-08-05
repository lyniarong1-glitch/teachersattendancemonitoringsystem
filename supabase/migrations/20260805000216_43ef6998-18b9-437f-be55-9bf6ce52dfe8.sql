ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS course_year text,
  ADD COLUMN IF NOT EXISTS class_schedule text,
  ADD COLUMN IF NOT EXISTS mobile_number text;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS username;