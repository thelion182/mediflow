-- ============================================================
-- MEDIFLOW - Row Level Security
-- ============================================================

-- Helpers
CREATE OR REPLACE FUNCTION auth_role()
RETURNS role_tipo LANGUAGE sql STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth_role() IN ('SUPER_ADMIN', 'ADMIN')
$$;

CREATE OR REPLACE FUNCTION is_coord_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth_role() IN ('SUPER_ADMIN', 'ADMIN', 'COORDINADOR')
$$;

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: propio usuario lee su perfil"
  ON profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles: admin lee todos"
  ON profiles FOR SELECT USING (is_admin_or_above());

CREATE POLICY "profiles: admin edita todos"
  ON profiles FOR UPDATE USING (is_admin_or_above());

-- ============================================================
-- medicos
-- ============================================================
ALTER TABLE medicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medicos: cualquier autenticado lee activos"
  ON medicos FOR SELECT USING (auth.uid() IS NOT NULL AND activo = TRUE);

CREATE POLICY "medicos: admin lee todos (incluye inactivos)"
  ON medicos FOR SELECT USING (is_admin_or_above());

CREATE POLICY "medicos: admin y coord escriben"
  ON medicos FOR ALL USING (is_coord_or_above());

-- ============================================================
-- sedes
-- ============================================================
ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sedes: cualquier autenticado lee activas"
  ON sedes FOR SELECT USING (auth.uid() IS NOT NULL AND activo = TRUE);

CREATE POLICY "sedes: admin escribe"
  ON sedes FOR ALL USING (is_admin_or_above());

-- ============================================================
-- sectores
-- ============================================================
ALTER TABLE sectores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sectores: cualquier autenticado lee activos"
  ON sectores FOR SELECT USING (auth.uid() IS NOT NULL AND activo = TRUE);

CREATE POLICY "sectores: admin escribe"
  ON sectores FOR ALL USING (is_admin_or_above());

-- ============================================================
-- system_config
-- ============================================================
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config: coord y arriba lee (sin secrets)"
  ON system_config FOR SELECT USING (is_coord_or_above());

CREATE POLICY "config: solo super_admin y admin editan"
  ON system_config FOR UPDATE USING (is_admin_or_above());

-- ============================================================
-- scoring_reglas
-- ============================================================
ALTER TABLE scoring_reglas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scoring_reglas: coord+ lee activas"
  ON scoring_reglas FOR SELECT USING (is_coord_or_above() AND activa = TRUE);

CREATE POLICY "scoring_reglas: admin+ escribe"
  ON scoring_reglas FOR ALL USING (is_admin_or_above());

-- ============================================================
-- convocatorias
-- ============================================================
ALTER TABLE convocatorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conv: coord+ ve todas"
  ON convocatorias FOR SELECT USING (is_coord_or_above());

CREATE POLICY "conv: medico ve sus convocatorias"
  ON convocatorias FOR SELECT USING (
    auth_role() = 'MEDICO'
    AND id IN (
      SELECT convocatoria_id FROM invitaciones
      WHERE medico_id = (
        SELECT medico_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "conv: coord+ crea"
  ON convocatorias FOR INSERT WITH CHECK (is_coord_or_above());

CREATE POLICY "conv: coord+ edita"
  ON convocatorias FOR UPDATE USING (is_coord_or_above());

-- ============================================================
-- invitaciones
-- ============================================================
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv: coord+ ve todas"
  ON invitaciones FOR SELECT USING (is_coord_or_above());

CREATE POLICY "inv: medico ve las suyas"
  ON invitaciones FOR SELECT USING (
    auth_role() = 'MEDICO'
    AND medico_id = (SELECT medico_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "inv: medico responde las suyas (UPDATE)"
  ON invitaciones FOR UPDATE USING (
    auth_role() = 'MEDICO'
    AND medico_id = (SELECT medico_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "inv: coord+ escribe"
  ON invitaciones FOR ALL USING (is_coord_or_above());

-- ============================================================
-- asignaciones
-- ============================================================
ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asig: coord+ ve todas"
  ON asignaciones FOR SELECT USING (is_coord_or_above());

CREATE POLICY "asig: medico ve las suyas"
  ON asignaciones FOR SELECT USING (
    auth_role() = 'MEDICO'
    AND medico_id = (SELECT medico_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "asig: coord+ escribe"
  ON asignaciones FOR ALL USING (is_coord_or_above());

-- ============================================================
-- scores_cache
-- ============================================================
ALTER TABLE scores_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores: admin+ ve todos"
  ON scores_cache FOR SELECT USING (is_admin_or_above());

CREATE POLICY "scores: medico ve el suyo"
  ON scores_cache FOR SELECT USING (
    auth_role() = 'MEDICO'
    AND medico_id = (SELECT medico_id FROM profiles WHERE id = auth.uid())
  );
