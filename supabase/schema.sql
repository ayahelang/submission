-- =====================================================
-- Silverhawk Submission - Database Schema
-- Jalankan di Supabase SQL Editor (sekali saja)
-- =====================================================

-- Roles
CREATE TYPE user_role AS ENUM ('admin', 'teacher');

-- Profiles (guru & admin)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'teacher',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes
CREATE TABLE classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks / Tugas
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,          -- base64 compressed JPEG
  grade NUMERIC(5,2),
  notes TEXT,
  graded_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, task_id)
);

-- Teacher access ke kelas tertentu (opsional, siap pakai)
CREATE TABLE teacher_class_access (
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_class_access ENABLE ROW LEVEL SECURITY;

-- ========== POLICIES ==========

-- Profiles
CREATE POLICY "Public read profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin full access profiles"
  ON profiles FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Classes
CREATE POLICY "Anyone can read classes"
  ON classes FOR SELECT USING (true);

CREATE POLICY "Teachers/Admin manage classes"
  ON classes FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- Students
CREATE POLICY "Anyone can read students"
  ON students FOR SELECT USING (true);

CREATE POLICY "Teachers/Admin manage students"
  ON students FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- Tasks
CREATE POLICY "Anyone can read tasks"
  ON tasks FOR SELECT USING (true);

CREATE POLICY "Teachers/Admin manage tasks"
  ON tasks FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- Submissions
CREATE POLICY "Anyone can insert submissions"
  ON submissions FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read submissions"
  ON submissions FOR SELECT USING (true);

CREATE POLICY "Teachers/Admin update/delete submissions"
  ON submissions FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','teacher'))
  );

-- Teacher class access
CREATE POLICY "Teachers see own access"
  ON teacher_class_access FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "Admin manage access"
  ON teacher_class_access FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ========== TRIGGER: Auto create profile ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'teacher')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
