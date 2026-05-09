-- ============================================================
-- MEDIFLOW - Función de cálculo de scoring
-- Llamada por Edge Function y por pg_cron diario
-- ============================================================

CREATE OR REPLACE FUNCTION calcular_scores(periodo_dias INTEGER DEFAULT 90)
RETURNS TABLE(
  medico_id         TEXT,
  score             NUMERIC,
  pct_aceptacion    NUMERIC,
  pct_velocidad     NUMERIC,
  pct_puntualidad   NUMERIC,
  pct_disponibilidad NUMERIC,
  inv_total         INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  cfg         JSONB;
  peso_a      NUMERIC;
  peso_v      NUMERIC;
  peso_p      NUMERIC;
  peso_d      NUMERIC;
  cutoff      TIMESTAMPTZ;
BEGIN
  -- Leer pesos de system_config
  SELECT scoring INTO cfg FROM system_config WHERE id = 'default';
  peso_a := COALESCE((cfg->>'pesoAceptacion')::NUMERIC,  40) / 100.0;
  peso_v := COALESCE((cfg->>'pesoVelocidad')::NUMERIC,   25) / 100.0;
  peso_p := COALESCE((cfg->>'pesoPuntualidad')::NUMERIC, 25) / 100.0;
  peso_d := COALESCE((cfg->>'pesoDisponibilidad')::NUMERIC, 10) / 100.0;

  cutoff := NOW() - (periodo_dias || ' days')::INTERVAL;

  RETURN QUERY
  WITH

  -- Invitaciones respondidas en el período
  inv_base AS (
    SELECT
      i.medico_id,
      COUNT(*) FILTER (WHERE i.estado IN ('ACEPTO','RECHAZO','SIN_RESPUESTA','VENCIDA')) AS total_resp,
      COUNT(*) FILTER (WHERE i.estado = 'ACEPTO')   AS aceptadas,
      COUNT(*) FILTER (WHERE i.estado = 'RECHAZO')  AS rechazadas,
      -- Velocidad: segundos promedio de respuesta (solo ACEPTO / RECHAZO)
      AVG(
        EXTRACT(EPOCH FROM (i.responded_at - i.sent_at))
      ) FILTER (
        WHERE i.estado IN ('ACEPTO','RECHAZO')
          AND i.responded_at IS NOT NULL
          AND i.sent_at      IS NOT NULL
      ) AS avg_resp_seg,
      COUNT(*) AS inv_total
    FROM invitaciones i
    JOIN convocatorias c ON c.id = i.convocatoria_id
    WHERE c.created_at >= cutoff
    GROUP BY i.medico_id
  ),

  -- Asignaciones cerradas (para puntualidad)
  asig_base AS (
    SELECT
      a.medico_id,
      COUNT(*) FILTER (WHERE a.estado IN ('CUMPLIDA','NO_CUMPLIDA','CANCELADA_POR_MEDICO')) AS total_cerradas,
      COUNT(*) FILTER (WHERE a.estado = 'CUMPLIDA') AS cumplidas
    FROM asignaciones a
    JOIN convocatorias c ON c.id = a.convocatoria_id
    WHERE c.created_at >= cutoff
    GROUP BY a.medico_id
  ),

  -- Disponibilidad: turnos nocturnos (20-07h) o fin de semana aceptados vs ofrecidos
  dispon_base AS (
    SELECT
      i.medico_id,
      COUNT(*) FILTER (
        WHERE (EXTRACT(HOUR FROM c.inicio) >= 20 OR EXTRACT(HOUR FROM c.inicio) < 7
              OR EXTRACT(DOW FROM c.inicio) IN (0, 6))
      ) AS ofrecidos_dificiles,
      COUNT(*) FILTER (
        WHERE i.estado = 'ACEPTO'
          AND (EXTRACT(HOUR FROM c.inicio) >= 20 OR EXTRACT(HOUR FROM c.inicio) < 7
              OR EXTRACT(DOW FROM c.inicio) IN (0, 6))
      ) AS aceptados_dificiles
    FROM invitaciones i
    JOIN convocatorias c ON c.id = i.convocatoria_id
    WHERE c.created_at >= cutoff
    GROUP BY i.medico_id
  )

  SELECT
    m.user_id                                               AS medico_id,
    -- Score final ponderado (0–100)
    ROUND(
      (
        -- Aceptación (0–1)
        CASE WHEN COALESCE(ib.total_resp, 0) > 0
          THEN (ib.aceptadas::NUMERIC / ib.total_resp) ELSE 0 END * peso_a
        +
        -- Velocidad: normalizada (0 min → 1.0, 60 min → 0.0)
        GREATEST(0,
          1.0 - COALESCE(ib.avg_resp_seg, 1800) / 3600.0
        ) * peso_v
        +
        -- Puntualidad
        CASE WHEN COALESCE(ab.total_cerradas, 0) > 0
          THEN (ab.cumplidas::NUMERIC / ab.total_cerradas) ELSE 0 END * peso_p
        +
        -- Disponibilidad
        CASE WHEN COALESCE(db.ofrecidos_dificiles, 0) > 0
          THEN (db.aceptados_dificiles::NUMERIC / db.ofrecidos_dificiles)
          ELSE CASE WHEN COALESCE(ib.total_resp, 0) > 0
            THEN (ib.aceptadas::NUMERIC / ib.total_resp) ELSE 0 END
        END * peso_d
      ) * 100
    , 1)                                                    AS score,

    ROUND(CASE WHEN COALESCE(ib.total_resp,0) > 0
      THEN ib.aceptadas::NUMERIC / ib.total_resp * 100 ELSE 0 END, 1) AS pct_aceptacion,

    ROUND(GREATEST(0, 1.0 - COALESCE(ib.avg_resp_seg, 1800) / 3600.0) * 100, 1) AS pct_velocidad,

    ROUND(CASE WHEN COALESCE(ab.total_cerradas,0) > 0
      THEN ab.cumplidas::NUMERIC / ab.total_cerradas * 100 ELSE 0 END, 1) AS pct_puntualidad,

    ROUND(CASE WHEN COALESCE(db.ofrecidos_dificiles,0) > 0
      THEN db.aceptados_dificiles::NUMERIC / db.ofrecidos_dificiles * 100
      ELSE CASE WHEN COALESCE(ib.total_resp,0) > 0
        THEN ib.aceptadas::NUMERIC / ib.total_resp * 100 ELSE 0 END
    END, 1)                                                 AS pct_disponibilidad,

    COALESCE(ib.inv_total, 0)::INTEGER                      AS inv_total

  FROM medicos m
  LEFT JOIN inv_base   ib ON ib.medico_id   = m.user_id
  LEFT JOIN asig_base  ab ON ab.medico_id   = m.user_id
  LEFT JOIN dispon_base db ON db.medico_id  = m.user_id
  WHERE m.activo = TRUE;
END;
$$;


-- ============================================================
-- Función que aplica reglas adicionales al score base
-- (scoring_reglas table). Se ejecuta después de calcular_scores.
-- ============================================================
CREATE OR REPLACE FUNCTION aplicar_reglas_scoring(
  p_medico_id TEXT,
  p_score_base NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql AS $$
DECLARE
  regla       RECORD;
  score_final NUMERIC := p_score_base;
BEGIN
  FOR regla IN
    SELECT * FROM scoring_reglas
    WHERE activa = TRUE
    ORDER BY orden ASC
  LOOP
    IF regla.modificador_tipo = 'MULTIPLICADOR' THEN
      score_final := score_final * regla.modificador_valor;
    ELSIF regla.modificador_tipo = 'PUNTOS' THEN
      score_final := score_final + regla.modificador_valor;
    END IF;
  END LOOP;

  -- Clampear a 0–100
  RETURN GREATEST(0, LEAST(100, ROUND(score_final, 1)));
END;
$$;


-- ============================================================
-- Función que actualiza scores_cache (llamable por Edge Fn y cron)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_scores_cache()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cfg         JSONB;
  periodo     INTEGER;
  filas       INTEGER := 0;
BEGIN
  SELECT scoring INTO cfg FROM system_config WHERE id = 'default';
  periodo := COALESCE((cfg->>'periodosDias')::INTEGER, 90);

  INSERT INTO scores_cache (
    medico_id, score, pct_aceptacion, pct_velocidad,
    pct_puntualidad, pct_disponibilidad, inv_total, calculated_at
  )
  SELECT
    cs.medico_id,
    aplicar_reglas_scoring(cs.medico_id, cs.score),
    cs.pct_aceptacion,
    cs.pct_velocidad,
    cs.pct_puntualidad,
    cs.pct_disponibilidad,
    cs.inv_total,
    NOW()
  FROM calcular_scores(periodo) cs
  ON CONFLICT (medico_id) DO UPDATE SET
    score              = EXCLUDED.score,
    pct_aceptacion     = EXCLUDED.pct_aceptacion,
    pct_velocidad      = EXCLUDED.pct_velocidad,
    pct_puntualidad    = EXCLUDED.pct_puntualidad,
    pct_disponibilidad = EXCLUDED.pct_disponibilidad,
    inv_total          = EXCLUDED.inv_total,
    calculated_at      = EXCLUDED.calculated_at;

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;


-- ============================================================
-- Avance automático SECUENCIAL (pg_cron cada minuto)
-- ============================================================
CREATE OR REPLACE FUNCTION avanzar_secuencial()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  conv        RECORD;
  inv_actual  RECORD;
  timeout_ver  INTEGER;
  timeout_resp INTEGER;
  ahora       TIMESTAMPTZ := NOW();
  avanzadas   INTEGER := 0;
BEGIN
  -- Iterar convocatorias ENVIADAS en modo SECUENCIAL
  FOR conv IN
    SELECT * FROM convocatorias
    WHERE estado IN ('ENVIADA', 'PARCIAL')
      AND modo_envio = 'SECUENCIAL'
      AND vencimiento > ahora
  LOOP
    timeout_ver  := COALESCE((conv.timeouts->>'sinVerMin')::INTEGER, 30);
    timeout_resp := COALESCE((conv.timeouts->>'sinResponderMin')::INTEGER, 15);

    -- Buscar la invitación activa actual (ENVIADA o VISTA)
    SELECT * INTO inv_actual
    FROM invitaciones
    WHERE convocatoria_id = conv.id
      AND estado IN ('ENVIADA', 'VISTA')
    ORDER BY orden ASC
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- ¿Expiró sin ver?
    IF inv_actual.estado = 'ENVIADA'
       AND inv_actual.sent_at IS NOT NULL
       AND inv_actual.sent_at + (timeout_ver || ' minutes')::INTERVAL < ahora
    THEN
      UPDATE invitaciones SET estado = 'SIN_RESPUESTA' WHERE id = inv_actual.id;

      -- Activar siguiente EN_ESPERA
      UPDATE invitaciones SET estado = 'ENVIADA', sent_at = ahora
      WHERE convocatoria_id = conv.id AND estado = 'EN_ESPERA'
        AND orden = (
          SELECT MIN(orden) FROM invitaciones
          WHERE convocatoria_id = conv.id AND estado = 'EN_ESPERA'
        );

      avanzadas := avanzadas + 1;
    END IF;

    -- ¿Expiró sin responder (vista pero no respondida)?
    IF inv_actual.estado = 'VISTA'
       AND inv_actual.sent_at IS NOT NULL
       AND inv_actual.sent_at + (timeout_resp || ' minutes')::INTERVAL < ahora
    THEN
      UPDATE invitaciones SET estado = 'SIN_RESPUESTA' WHERE id = inv_actual.id;

      UPDATE invitaciones SET estado = 'ENVIADA', sent_at = ahora
      WHERE convocatoria_id = conv.id AND estado = 'EN_ESPERA'
        AND orden = (
          SELECT MIN(orden) FROM invitaciones
          WHERE convocatoria_id = conv.id AND estado = 'EN_ESPERA'
        );

      avanzadas := avanzadas + 1;
    END IF;

  END LOOP;

  RETURN avanzadas;
END;
$$;


-- ============================================================
-- pg_cron jobs
-- ============================================================
-- Avance secuencial: cada minuto
SELECT cron.schedule(
  'mediflow-avance-secuencial',
  '* * * * *',
  'SELECT avanzar_secuencial()'
);

-- Scores: cada noche a las 2am
SELECT cron.schedule(
  'mediflow-refresh-scores',
  '0 2 * * *',
  'SELECT refresh_scores_cache()'
);
