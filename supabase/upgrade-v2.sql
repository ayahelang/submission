-- =====================================================
-- Silverhawk Submission - Upgrade v2
-- Ownership + Sharing + Status + Public Toggle + Student Password
-- Jalankan di SQL Editor (sekali saja)
-- =====================================================

-- 1. Kolom baru
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

ALTER TABLE submissions 
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS reject_reason text;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Constraint status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_status_check') THEN
    ALTER TABLE submissions 
      ADD CONSTRAINT submissions_status_check 
      CHECK (status IN ('submitted', 'graded', 'rejected'));
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Tabel sharing akses per kelas
CREATE TABLE IF NOT EXISTS class_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  can_edit boolean DEFAULT true,
  can_grade boolean DEFAULT true,
  can_delete boolean DEFAULT false,
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(class_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_class_access_teacher ON class_access(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_access_class ON class_access(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_created_by ON classes(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);

ALTER TABLE class_access ENABLE ROW LEVEL SECURITY;

-- 3. Bersihkan policy lama
DROP POLICY IF EXISTS "Anyone can read classes" ON classes;
DROP POLICY IF EXISTS "Teachers/Admin manage classes" ON classes;
DROP POLICY IF EXISTS "Anyone can read students" ON students;
DROP POLICY IF EXISTS "Teachers/Admin manage students" ON students;
DROP POLICY IF EXISTS "Anyone can read tasks" ON tasks;
DROP POLICY IF EXISTS "Teachers/Admin manage tasks" ON tasks;
DROP POLICY IF EXISTS "Anyone can insert submissions" ON submissions;
DROP POLICY IF EXISTS "Anyone can read submissions" ON submissions;
DROP POLICY IF EXISTS "Teachers/Admin update/delete submissions" ON submissions;
DROP POLICY IF EXISTS "Teachers see own access" ON teacher_class_access;
DROP POLICY IF EXISTS "Admin manage access" ON teacher_class_access;
DROP POLICY IF EXISTS "classes_select" ON classes;
DROP POLICY IF EXISTS "classes_insert" ON classes;
DROP POLICY IF EXISTS "classes_update" ON classes;
DROP POLICY IF EXISTS "classes_delete" ON classes;
DROP POLICY IF EXISTS "students_select" ON students;
DROP POLICY IF EXISTS "students_insert" ON students;
DROP POLICY IF EXISTS "students_update" ON students;
DROP POLICY IF EXISTS "students_delete" ON students;
DROP POLICY IF EXISTS "tasks_select" ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;
DROP POLICY IF EXISTS "submissions_insert" ON submissions;
DROP POLICY IF EXISTS "submissions_select" ON submissions;
DROP POLICY IF EXISTS "submissions_update" ON submissions;
DROP POLICY IF EXISTS "submissions_delete" ON submissions;
DROP POLICY IF EXISTS "class_access_select" ON class_access;
DROP POLICY IF EXISTS "class_access_insert" ON class_access;
DROP POLICY IF EXISTS "class_access_update" ON class_access;
DROP POLICY IF EXISTS "class_access_delete" ON class_access;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can do everything on profiles" ON profiles;
DROP POLICY IF EXISTS "Public read profiles" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin full access profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin" ON profiles;

-- 4. Policy Profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- 5. Policy Classes
CREATE POLICY "classes_select" ON classes FOR SELECT USING (true);
CREATE POLICY "classes_insert" ON classes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "classes_update" ON classes FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = classes.id AND ca.teacher_id = auth.uid() AND ca.can_edit = true)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "classes_delete" ON classes FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = classes.id AND ca.teacher_id = auth.uid() AND ca.can_delete = true)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Policy Students
CREATE POLICY "students_select" ON students FOR SELECT USING (true);
CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM classes c WHERE c.id = students.class_id AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = c.id AND ca.teacher_id = auth.uid() AND ca.can_edit)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);
CREATE POLICY "students_update" ON students FOR UPDATE USING (true);
CREATE POLICY "students_delete" ON students FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM classes c WHERE c.id = students.class_id AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = c.id AND ca.teacher_id = auth.uid() AND ca.can_delete)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);

-- 7. Policy Tasks
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (true);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM classes c WHERE c.id = tasks.class_id AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = c.id AND ca.teacher_id = auth.uid() AND ca.can_edit)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = tasks.class_id AND ca.teacher_id = auth.uid() AND ca.can_edit)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = tasks.class_id AND ca.teacher_id = auth.uid() AND ca.can_delete)
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 8. Policy Submissions
CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (true);
CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN classes c ON c.id = t.class_id
    WHERE t.id = submissions.task_id AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = c.id AND ca.teacher_id = auth.uid() AND ca.can_grade)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);
CREATE POLICY "submissions_delete" ON submissions FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM tasks t
    JOIN classes c ON c.id = t.class_id
    WHERE t.id = submissions.task_id AND (
      c.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM class_access ca WHERE ca.class_id = c.id AND ca.teacher_id = auth.uid() AND ca.can_delete)
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
);

-- 9. Policy Class Access
CREATE POLICY "class_access_select" ON class_access FOR SELECT USING (
  teacher_id = auth.uid()
  OR granted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM classes WHERE id = class_access.class_id AND created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "class_access_insert" ON class_access FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE id = class_access.class_id AND created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "class_access_update" ON class_access FOR UPDATE USING (
  EXISTS (SELECT 1 FROM classes WHERE id = class_access.class_id AND created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "class_access_delete" ON class_access FOR DELETE USING (
  EXISTS (SELECT 1 FROM classes WHERE id = class_access.class_id AND created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

SELECT 'Upgrade v2 berhasil dijalankan' AS status;
