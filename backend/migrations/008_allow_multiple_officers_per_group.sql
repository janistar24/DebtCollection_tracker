BEGIN;

-- หนึ่งกลุ่มสามารถมีเจ้าหน้าที่ผู้รับผิดชอบที่ใช้งานอยู่พร้อมกันได้หลายบัญชี
DROP INDEX IF EXISTS public.uq_active_responsibility_group;

COMMIT;
