ALTER TABLE public.attendance_records ALTER COLUMN submitted_by DROP NOT NULL;

ALTER TABLE public.attendance_records DROP CONSTRAINT attendance_records_submitted_by_fkey;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_records DROP CONSTRAINT attendance_records_last_edited_by_fkey;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;