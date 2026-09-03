-- =====================================================
-- Setup Admin Pertama
-- 1. Buat user di Authentication → Users → Add user
-- 2. Jalankan query ini (ganti email sesuai yang dibuat)
-- =====================================================

UPDATE profiles 
SET 
  role = 'admin', 
  username = 'admin', 
  full_name = 'Admin Silverhawk'
WHERE id = (
  SELECT id FROM auth.users 
  WHERE email = 'admin@silverhawk.web.id'   -- ganti email ini
);
