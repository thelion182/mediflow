import React, { useMemo, useState } from "react";
import { AppShell } from "../../ui/AppShell";
import { configStore } from "./config.store";
import { authStore } from "../../auth/auth.store";
import { UsersAdmin } from "./UsersAdmin";
import { prioAuditStore, type PrioAuditEntry } from "../convocatorias/prio.audit.store";
import type { SystemConfig, Canal, WhatsAppProvider, SmsProvider, EmailProvider, FotosConfig } from "./config.types";
import { CANAL_META } from "./config.types";

type Tab = "usuarios" | "org" | "canales" | "defaults" | "scoring" | "auditoria";

// ── Toggle ────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: value ? `rgb(${CANAL_META.APP.rgb})` : "var(--border)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute",
        top: 3,
        left: value ? 22 : 3,
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "white",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </button>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--subtle)", lineHeight: 1.4 }}>{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Canal header row ──────────────────────────────────────────────────────
function CanalHeader({ canal, enabled, onToggle, rgb }: { canal: string; enabled: boolean; onToggle: (v: boolean) => void; rgb: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `rgba(${rgb}, 0.12)`,
          border: `1px solid rgba(${rgb}, 0.25)`,
          display: "grid", placeItems: "center",
          fontSize: 14, color: `rgb(${rgb})`, fontWeight: 700,
        }}>
          {canal === "WhatsApp" ? "W" : canal === "SMS" ? "S" : canal === "Email" ? "@" : "A"}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{canal}</div>
          <div style={{ fontSize: 12, color: enabled ? `rgb(${rgb})` : "var(--subtle)" }}>
            {enabled ? "Habilitado" : "Deshabilitado"}
          </div>
        </div>
      </div>
      <Toggle value={enabled} onChange={onToggle} />
    </div>
  );
}

// ── ConfigPage ────────────────────────────────────────────────────────────
export function ConfigPage() {
  const [tab, setTab] = useState<Tab>("usuarios");
  const session = authStore.getSession();
  const [cfg, setCfg] = useState<SystemConfig>(() => configStore.get());
  const [saved, setSaved] = useState(false);

  function save() {
    configStore.set(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function reset() {
    if (!confirm("¿Restablecer toda la configuración a los valores por defecto?")) return;
    configStore.reset();
    setCfg(configStore.get());
  }

  // Typed updaters
  function setOrg<K extends keyof SystemConfig["organizacion"]>(k: K, v: SystemConfig["organizacion"][K]) {
    setCfg(c => ({ ...c, organizacion: { ...c.organizacion, [k]: v } }));
  }
  function setWhatsApp<K extends keyof SystemConfig["canales"]["whatsapp"]>(k: K, v: any) {
    setCfg(c => ({ ...c, canales: { ...c.canales, whatsapp: { ...c.canales.whatsapp, [k]: v } } }));
  }
  function setSms<K extends keyof SystemConfig["canales"]["sms"]>(k: K, v: any) {
    setCfg(c => ({ ...c, canales: { ...c.canales, sms: { ...c.canales.sms, [k]: v } } }));
  }
  function setEmail<K extends keyof SystemConfig["canales"]["email"]>(k: K, v: any) {
    setCfg(c => ({ ...c, canales: { ...c.canales, email: { ...c.canales.email, [k]: v } } }));
  }
  function setConv<K extends keyof SystemConfig["convocatorias"]>(k: K, v: any) {
    setCfg(c => ({ ...c, convocatorias: { ...c.convocatorias, [k]: v } }));
  }
  function setScoring<K extends keyof SystemConfig["scoring"]>(k: K, v: any) {
    setCfg(c => ({ ...c, scoring: { ...c.scoring, [k]: v } }));
  }
  function setFotos<K extends keyof FotosConfig>(k: K, v: any) {
    setCfg(c => ({ ...c, fotos: { ...c.fotos, [k]: v } }));
  }
  function toggleDefaultCanal(canal: Canal) {
    setCfg(c => {
      const prev = c.defaultCanales;
      const next = prev.includes(canal) ? prev.filter(x => x !== canal) : [...prev, canal];
      return { ...c, defaultCanales: next };
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "usuarios",  label: "Usuarios" },
    { id: "canales",   label: "Canales" },
    { id: "defaults",  label: "Convocatorias" },
    { id: "scoring",   label: "Scoring" },
    { id: "org",       label: "Organización" },
    ...(session?.role === "SUPER_ADMIN" ? [{ id: "auditoria" as Tab, label: "Auditoría prioridades" }] : []),
  ];

  return (
    <AppShell>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Configuración</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Solo visible para Super Admin · Cambios se guardan en este navegador</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={reset} style={{ ...ghostBtn, color: "var(--danger)", borderColor: "rgba(220,38,38,0.25)" }}>
            Restablecer defaults
          </button>
          <button onClick={save} style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: saved ? "rgb(22,163,74)" : "linear-gradient(180deg, var(--blue-mid), var(--blue))",
            color: "white", fontWeight: 600, fontSize: 13.5, cursor: "pointer",
            boxShadow: saved ? "0 2px 8px rgba(22,163,74,0.3)" : "0 2px 8px rgba(21,101,192,0.25)",
            transition: "background 0.2s",
          }}>
            {saved ? "✓ Guardado" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)", borderBottom: tab === t.id ? "2px solid var(--blue)" : "1px solid var(--border)",
            background: tab === t.id ? "var(--blue-tint)" : "var(--surface)",
            color: tab === t.id ? "var(--blue)" : "var(--muted)",
            fontWeight: tab === t.id ? 700 : 500,
            fontSize: 13.5, cursor: "pointer", marginBottom: -1,
            transition: "background 0.12s, color 0.12s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Usuarios ─────────────────────────────────────────────────── */}
      {tab === "usuarios" && (
        <UsersAdmin currentRole={session?.role ?? "ADMIN"} />
      )}

      {/* ── Tab: Canales ──────────────────────────────────────────────────── */}
      {tab === "canales" && (
        <div style={{ display: "grid", gap: 16 }}>

          {/* Canales por defecto */}
          <div style={sectionStyle}>
            <h2 style={sectionTitle}>Canales por defecto</h2>
            <p style={sectionDesc}>
              Estos canales se preseleccionan al crear una nueva convocatoria. El coordinador puede cambiarlos por convocatoria.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {(["APP", "WHATSAPP", "SMS", "EMAIL"] as Canal[]).map(canal => {
                const meta = CANAL_META[canal];
                const habilitado = canal === "APP" ? cfg.canales.app.enabled
                  : canal === "WHATSAPP" ? cfg.canales.whatsapp.enabled
                  : canal === "SMS" ? cfg.canales.sms.enabled
                  : cfg.canales.email.enabled;
                const selected = cfg.defaultCanales.includes(canal);
                return (
                  <button
                    key={canal}
                    onClick={() => habilitado && toggleDefaultCanal(canal)}
                    title={!habilitado ? "Canal deshabilitado — habilitalo primero" : ""}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1.5px solid ${selected && habilitado ? `rgb(${meta.rgb})` : "var(--border)"}`,
                      background: selected && habilitado ? `rgba(${meta.rgb}, 0.10)` : "var(--surface-2)",
                      color: selected && habilitado ? `rgb(${meta.rgb})` : habilitado ? "var(--muted)" : "var(--subtle)",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: habilitado ? "pointer" : "not-allowed",
                      opacity: habilitado ? 1 : 0.5,
                      transition: "all 0.12s",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {selected && habilitado ? "✓ " : ""}{meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* WhatsApp */}
          <div style={sectionStyle}>
            <CanalHeader
              canal="WhatsApp"
              enabled={cfg.canales.whatsapp.enabled}
              onToggle={v => setWhatsApp("enabled", v)}
              rgb={CANAL_META.WHATSAPP.rgb}
            />

            {cfg.canales.whatsapp.enabled && (
              <>
                <Field label="Proveedor">
                  <Select
                    value={cfg.canales.whatsapp.provider}
                    onChange={v => setWhatsApp("provider", v as WhatsAppProvider)}
                    options={[
                      { value: "ENLACE_MANUAL",          label: "Enlace manual (wa.me) — actual, sin backend" },
                      { value: "WHATSAPP_BUSINESS_API",  label: "WhatsApp Business API (Meta)" },
                      { value: "TWILIO",                 label: "Twilio WhatsApp" },
                    ]}
                  />
                </Field>

                {cfg.canales.whatsapp.provider === "ENLACE_MANUAL" && (
                  <div style={infoBoxStyle}>
                    <b>Modo actual:</b> al enviar convocatoria, el sistema abre un enlace wa.me en el navegador con un mensaje prellenado.
                    No requiere backend. Para respuestas automáticas, elegí otro proveedor.
                  </div>
                )}

                {cfg.canales.whatsapp.provider === "WHATSAPP_BUSINESS_API" && (
                  <>
                    <div style={{ ...infoBoxStyle, borderColor: "rgba(37,211,102,0.3)" }}>
                      Requiere backend. El backend enviará mensajes via API de Meta y recibirá respuestas por webhook.
                    </div>
                    <Field label="Phone Number ID" hint="Meta Business Manager → Cuenta de WhatsApp">
                      <Input value={cfg.canales.whatsapp.phoneNumberId ?? ""} onChange={v => setWhatsApp("phoneNumberId", v)} placeholder="123456789012345" />
                    </Field>
                    <Field label="Access Token" hint="Token permanente del sistema (no el temporal de pruebas)">
                      <Input value={cfg.canales.whatsapp.accessToken ?? ""} onChange={v => setWhatsApp("accessToken", v)} placeholder="EAAXXXXXXX..." type="password" />
                    </Field>
                    <Field label="Webhook Verify Token" hint="Token secreto para verificar el webhook (lo definís vos)">
                      <Input value={cfg.canales.whatsapp.webhookVerifyToken ?? ""} onChange={v => setWhatsApp("webhookVerifyToken", v)} placeholder="mi-token-secreto-2024" />
                    </Field>
                  </>
                )}

                {cfg.canales.whatsapp.provider === "TWILIO" && (
                  <>
                    <div style={{ ...infoBoxStyle, borderColor: "rgba(37,211,102,0.3)" }}>
                      Requiere backend. Twilio enviará mensajes WA Sandbox o número aprobado y recibirá respuestas por webhook.
                    </div>
                    <Field label="Account SID">
                      <Input value={cfg.canales.whatsapp.accountSid ?? ""} onChange={v => setWhatsApp("accountSid", v)} placeholder="ACxxxxxxxx" />
                    </Field>
                    <Field label="Auth Token">
                      <Input value={cfg.canales.whatsapp.authToken ?? ""} onChange={v => setWhatsApp("authToken", v)} placeholder="xxxxxxxx" type="password" />
                    </Field>
                    <Field label="Número Twilio WA" hint="Formato: whatsapp:+14155238886">
                      <Input value={cfg.canales.whatsapp.fromNumber ?? ""} onChange={v => setWhatsApp("fromNumber", v)} placeholder="whatsapp:+14155238886" />
                    </Field>
                    <Field label="Webhook Secret" hint="Para validar firma de requests entrantes">
                      <Input value={cfg.canales.whatsapp.webhookSecret ?? ""} onChange={v => setWhatsApp("webhookSecret", v)} placeholder="secreto" type="password" />
                    </Field>
                  </>
                )}

                <Field label="WhatsApp de Suplencias (coordinación interna)" hint="Número del coordinador al que los médicos pueden responder">
                  <Input value={cfg.organizacion.whatsappSuplencias} onChange={v => setOrg("whatsappSuplencias", v)} placeholder="+598XXXXXXXX" />
                </Field>
              </>
            )}
          </div>

          {/* SMS */}
          <div style={sectionStyle}>
            <CanalHeader
              canal="SMS"
              enabled={cfg.canales.sms.enabled}
              onToggle={v => setSms("enabled", v)}
              rgb={CANAL_META.SMS.rgb}
            />

            {cfg.canales.sms.enabled && (
              <>
                <div style={infoBoxStyle}>
                  Requiere backend para enviar SMS y recibir respuestas por webhook.
                  El médico responde con "1" (acepto) o "2" (rechazo) y el sistema actualiza la convocatoria automáticamente.
                </div>
                <Field label="Proveedor">
                  <Select
                    value={cfg.canales.sms.provider}
                    onChange={v => setSms("provider", v as SmsProvider)}
                    options={[
                      { value: "TWILIO",        label: "Twilio SMS" },
                      { value: "SMSMASSIVOS_UY", label: "SMSMasivos.uy (Uruguay)" },
                      { value: "AWS_SNS",        label: "AWS SNS" },
                    ]}
                  />
                </Field>

                {(cfg.canales.sms.provider === "TWILIO") && (
                  <>
                    <Field label="Account SID">
                      <Input value={cfg.canales.sms.accountSid ?? ""} onChange={v => setSms("accountSid", v)} placeholder="ACxxxxxxxx" />
                    </Field>
                    <Field label="Auth Token">
                      <Input value={cfg.canales.sms.authToken ?? ""} onChange={v => setSms("authToken", v)} placeholder="xxxxxxxx" type="password" />
                    </Field>
                    <Field label="Número remitente">
                      <Input value={cfg.canales.sms.fromNumber ?? ""} onChange={v => setSms("fromNumber", v)} placeholder="+15551234567" />
                    </Field>
                    <Field label="Webhook Secret" hint="Para validar firma de Twilio en requests entrantes">
                      <Input value={cfg.canales.sms.webhookSecret ?? ""} onChange={v => setSms("webhookSecret", v)} placeholder="secreto" type="password" />
                    </Field>
                  </>
                )}

                {cfg.canales.sms.provider === "SMSMASSIVOS_UY" && (
                  <>
                    <Field label="API Key / Token">
                      <Input value={cfg.canales.sms.authToken ?? ""} onChange={v => setSms("authToken", v)} placeholder="token de SMSMasivos" type="password" />
                    </Field>
                    <Field label="Número remitente o nombre alfanumérico">
                      <Input value={cfg.canales.sms.fromNumber ?? ""} onChange={v => setSms("fromNumber", v)} placeholder="MEDIFLOW" />
                    </Field>
                  </>
                )}

                {cfg.canales.sms.provider === "AWS_SNS" && (
                  <>
                    <Field label="AWS Region">
                      <Input value={cfg.canales.sms.awsRegion ?? ""} onChange={v => setSms("awsRegion", v)} placeholder="us-east-1" />
                    </Field>
                    <Field label="AWS Access Key ID">
                      <Input value={cfg.canales.sms.awsAccessKey ?? ""} onChange={v => setSms("awsAccessKey", v)} placeholder="AKIAIOSFODNN7EXAMPLE" />
                    </Field>
                    <Field label="AWS Secret Access Key">
                      <Input value={cfg.canales.sms.awsSecretKey ?? ""} onChange={v => setSms("awsSecretKey", v)} placeholder="xxxxxxxx" type="password" />
                    </Field>
                  </>
                )}

                <div style={{ ...infoBoxStyle, marginTop: 8 }}>
                  <b>Plantilla de mensaje SMS:</b><br />
                  <code style={{ fontSize: 12, fontFamily: "monospace" }}>
                    "Hola Dr. [NOMBRE]. Turno en [SECTOR] el [FECHA] [HORA_INICIO] a [HORA_FIN] en [SEDE]. Responda 1=ACEPTO 2=RECHAZO. Mediflow"
                  </code>
                </div>
              </>
            )}
          </div>

          {/* Email */}
          <div style={sectionStyle}>
            <CanalHeader
              canal="Email"
              enabled={cfg.canales.email.enabled}
              onToggle={v => setEmail("enabled", v)}
              rgb={CANAL_META.EMAIL.rgb}
            />

            {cfg.canales.email.enabled && (
              <>
                <div style={infoBoxStyle}>
                  Requiere backend. El médico recibirá un email con botones de "Aceptar" / "Rechazar" que actualizan la convocatoria al hacer clic.
                </div>
                <Field label="Proveedor">
                  <Select
                    value={cfg.canales.email.provider}
                    onChange={v => setEmail("provider", v as EmailProvider)}
                    options={[
                      { value: "SENDGRID",  label: "SendGrid" },
                      { value: "RESEND",    label: "Resend" },
                      { value: "SMTP",      label: "SMTP (servidor propio)" },
                      { value: "AWS_SES",   label: "AWS SES" },
                    ]}
                  />
                </Field>
                <Field label="Email remitente">
                  <Input value={cfg.canales.email.fromEmail ?? ""} onChange={v => setEmail("fromEmail", v)} placeholder="suplencias@miorganizacion.com" type="email" />
                </Field>
                <Field label="Nombre remitente">
                  <Input value={cfg.canales.email.fromName ?? ""} onChange={v => setEmail("fromName", v)} placeholder="Suplencias Médicas" />
                </Field>

                {(cfg.canales.email.provider === "SENDGRID" || cfg.canales.email.provider === "RESEND") && (
                  <Field label="API Key">
                    <Input value={cfg.canales.email.apiKey ?? ""} onChange={v => setEmail("apiKey", v)} placeholder="SG.xxxxxxx / re_xxxxxxx" type="password" />
                  </Field>
                )}

                {cfg.canales.email.provider === "SMTP" && (
                  <>
                    <Field label="Servidor SMTP">
                      <Input value={cfg.canales.email.smtpHost ?? ""} onChange={v => setEmail("smtpHost", v)} placeholder="smtp.gmail.com" />
                    </Field>
                    <Field label="Puerto">
                      <Input value={String(cfg.canales.email.smtpPort ?? 587)} onChange={v => setEmail("smtpPort", Number(v))} placeholder="587" type="number" />
                    </Field>
                    <Field label="Usuario SMTP">
                      <Input value={cfg.canales.email.smtpUser ?? ""} onChange={v => setEmail("smtpUser", v)} placeholder="usuario@gmail.com" />
                    </Field>
                    <Field label="Contraseña SMTP">
                      <Input value={cfg.canales.email.smtpPass ?? ""} onChange={v => setEmail("smtpPass", v)} placeholder="contraseña" type="password" />
                    </Field>
                  </>
                )}

                {cfg.canales.email.provider === "AWS_SES" && (
                  <>
                    <Field label="AWS Region">
                      <Input value={cfg.canales.email.awsRegion ?? ""} onChange={v => setEmail("awsRegion", v)} placeholder="us-east-1" />
                    </Field>
                    <Field label="AWS Access Key ID">
                      <Input value={cfg.canales.email.awsAccessKey ?? ""} onChange={v => setEmail("awsAccessKey", v)} placeholder="AKIAIOSFODNN7EXAMPLE" />
                    </Field>
                    <Field label="AWS Secret Access Key">
                      <Input value={cfg.canales.email.awsSecretKey ?? ""} onChange={v => setEmail("awsSecretKey", v)} placeholder="xxxxxxxx" type="password" />
                    </Field>
                  </>
                )}
              </>
            )}
          </div>

          {/* App */}
          <div style={sectionStyle}>
            <CanalHeader
              canal="App (portal web)"
              enabled={cfg.canales.app.enabled}
              onToggle={v => setCfg(c => ({ ...c, canales: { ...c.canales, app: { enabled: v } } }))}
              rgb={CANAL_META.APP.rgb}
            />
            {!cfg.canales.app.enabled && (
              <div style={{ ...infoBoxStyle, borderColor: "rgba(220,38,38,0.2)", color: "var(--danger)", background: "rgba(220,38,38,0.05)" }}>
                Si deshabilitás la App, los médicos no podrán ver convocatorias en el portal web.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Defaults convocatorias ───────────────────────────────────── */}
      {tab === "defaults" && (
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Valores por defecto para nuevas convocatorias</h2>
          <p style={sectionDesc}>Se usan al abrir el formulario de "Nueva Convocatoria". El coordinador puede cambiarlos por turno.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginTop: 16 }}>
            <Field label="Modo de envío">
              <Select
                value={cfg.convocatorias.defaultModoEnvio}
                onChange={v => setConv("defaultModoEnvio", v)}
                options={[
                  { value: "SECUENCIAL", label: "Secuencial (1 a la vez por prioridad)" },
                  { value: "MASIVO",     label: "Masivo (todos al mismo tiempo)" },
                ]}
              />
            </Field>

            <Field label="Cupos por defecto">
              <Input
                value={String(cfg.convocatorias.defaultCupos)}
                onChange={v => setConv("defaultCupos", Math.max(1, parseInt(v) || 1))}
                type="number"
                placeholder="1"
              />
            </Field>

            <Field label="Prioridad por defecto">
              <Select
                value={cfg.convocatorias.defaultPrioridad}
                onChange={v => setConv("defaultPrioridad", v)}
                options={[
                  { value: "NORMAL", label: "Normal" },
                  { value: "ALTA",   label: "Alta" },
                ]}
              />
            </Field>

            <Field label="Timeout: sin ver (minutos)" hint="Secuencial: si el médico no ve la invitación en este tiempo, pasa al siguiente">
              <Input
                value={String(cfg.convocatorias.defaultSinVerMin)}
                onChange={v => setConv("defaultSinVerMin", Math.max(1, parseInt(v) || 30))}
                type="number"
                placeholder="30"
              />
            </Field>

            <Field label="Timeout: sin responder (minutos)" hint="Si vio la invitación pero no respondió, pasa al siguiente">
              <Input
                value={String(cfg.convocatorias.defaultSinResponderMin)}
                onChange={v => setConv("defaultSinResponderMin", Math.max(1, parseInt(v) || 15))}
                type="number"
                placeholder="15"
              />
            </Field>
          </div>
        </div>
      )}

      {/* ── Tab: Scoring ──────────────────────────────────────────────────── */}
      {tab === "scoring" && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Sistema de puntaje médicos</h2>
            <Toggle value={cfg.scoring.enabled} onChange={v => setScoring("enabled", v)} />
          </div>
          <p style={sectionDesc}>
            Calcula un score 0–100 por médico basado en su conducta histórica. Puede usarse para ordenar la prioridad secuencial automáticamente.
          </p>

          {cfg.scoring.enabled && (
            <div style={{ marginTop: 16 }}>
              <Field label="Período de cálculo (días)" hint="Se analizan las últimas N días de actividad">
                <Input
                  value={String(cfg.scoring.periodosDias)}
                  onChange={v => setScoring("periodosDias", Math.max(7, parseInt(v) || 90))}
                  type="number"
                  placeholder="90"
                />
              </Field>

              <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 14, marginTop: 10 }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  Pesos del score (deben sumar 100)
                  <span style={{ marginLeft: 8, fontSize: 12, color: pesoTotal(cfg) === 100 ? "var(--green-dark)" : "var(--danger)", fontWeight: 700 }}>
                    Total: {pesoTotal(cfg)}%
                  </span>
                </p>
                {([
                  { key: "pesoAceptacion",    label: "Tasa de aceptación",          hint: "Aceptadas / invitadas" },
                  { key: "pesoVelocidad",     label: "Velocidad de respuesta",       hint: "Tiempo promedio hasta responder" },
                  { key: "pesoPuntualidad",   label: "Puntualidad (asistencia real)",hint: "CUMPLIDA / CONFIRMADA" },
                  { key: "pesoDisponibilidad",label: "Disponibilidad horaria",       hint: "Acepta turnos difíciles (noche, finde)" },
                ] as const).map(item => (
                  <Field key={item.key} label={`${item.label} (%)`} hint={item.hint}>
                    <Input
                      value={String((cfg.scoring as any)[item.key])}
                      onChange={v => setScoring(item.key, Math.max(0, Math.min(100, parseInt(v) || 0)))}
                      type="number"
                      placeholder="25"
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Auditoría de prioridades ────────────────────────────────── */}
      {tab === "auditoria" && session?.role === "SUPER_ADMIN" && (
        <AuditoriaTab />
      )}

      {/* ── Tab: Organización ─────────────────────────────────────────────── */}
      {tab === "org" && (
        <div style={sectionStyle}>
          <h2 style={sectionTitle}>Organización</h2>
          <Field label="Nombre de la organización">
            <Input value={cfg.organizacion.nombre} onChange={v => setOrg("nombre", v)} placeholder="Sanatorio XYZ" />
          </Field>
          <Field label="WhatsApp de coordinación (Suplencias)" hint="Número al que los médicos pueden enviar respuestas rápidas por WA">
            <Input value={cfg.organizacion.whatsappSuplencias} onChange={v => setOrg("whatsappSuplencias", v)} placeholder="+598XXXXXXXX" />
          </Field>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border-2)" }}>
            <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Fotos de médicos</p>
            <Field label="URL base de la carpeta de fotos" hint="Ruta local o URL de la intranet donde se encuentran las imágenes (sin barra final)">
              <Input
                value={cfg.fotos.baseUrl}
                onChange={v => setFotos("baseUrl", v)}
                placeholder="http://intranet/fotos"
              />
            </Field>
            <Field label="Campo del médico usado como nombre de archivo" hint="El valor de este campo + extensión forma el nombre del archivo de imagen">
              <Select
                value={cfg.fotos.campo}
                onChange={v => setFotos("campo", v as FotosConfig["campo"])}
                options={[
                  { value: "funcionario", label: "Nro funcionario (campo: funcionario)" },
                  { value: "cedula",      label: "Cédula de identidad (campo: cedula)" },
                  { value: "userId",      label: "userId completo (ej: F-93598)" },
                ]}
              />
            </Field>
            <Field label="Extensión de imagen">
              <Select
                value={cfg.fotos.extension}
                onChange={v => setFotos("extension", v as FotosConfig["extension"])}
                options={[
                  { value: "jpg",  label: "JPG / JPEG" },
                  { value: "jpeg", label: "JPEG" },
                  { value: "png",  label: "PNG" },
                  { value: "webp", label: "WebP" },
                ]}
              />
            </Field>
            {cfg.fotos.baseUrl && (
              <div style={{ ...infoBoxStyle, marginTop: 2 }}>
                Las fotos se cargarán como: <code style={{ fontFamily: "monospace", fontSize: 12 }}>{cfg.fotos.baseUrl}/{"{" + cfg.fotos.campo + "}"}.{cfg.fotos.extension}</code>
                <br />Las miniaturas cacheadas se guardan en el navegador (localStorage). Si la URL base es externa, verificá que el servidor permita CORS.
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, padding: 14, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)" }}>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Accesos demo activos</p>
            <div style={{ display: "grid", gap: 4, fontSize: 12.5, color: "var(--muted)" }}>
              <div><b style={{ color: "var(--text)" }}>9999</b> → Super Admin</div>
              <div><b style={{ color: "var(--text)" }}>2001</b> → Administrador</div>
              <div><b style={{ color: "var(--text)" }}>1001</b> → Coordinador</div>
              <div><b style={{ color: "var(--muted)" }}>cualquier médico del catálogo</b> → Médico</div>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--subtle)" }}>
              Los accesos demo son fijos en esta versión (frontend-only). En la versión con backend, se gestionarán desde Usuarios.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Auditoría de prioridades ──────────────────────────────────────────────
function AuditoriaTab() {
  const [tick, setTick] = useState(0);
  const entries = useMemo(() => prioAuditStore.list(), [tick]);

  function fmtDt(iso: string) {
    return new Date(iso).toLocaleString("es-UY", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...sectionStyle, paddingBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <h2 style={{ ...sectionTitle, margin: 0 }}>Registros de prioridad manual</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
              Convocatorias donde el usuario eligió prioridad manual en vez del scoring automático.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setTick(t => t + 1)} style={{ ...ghostBtn, fontSize: 12 }}>↺ Refrescar</button>
            {entries.length > 0 && (
              <button
                onClick={() => { if (confirm("¿Borrar todos los registros de auditoría? Esta acción no se puede deshacer.")) { prioAuditStore.clear(); setTick(t => t + 1); } }}
                style={{ ...ghostBtn, fontSize: 12, color: "var(--danger)", borderColor: "rgba(220,38,38,0.25)" }}
              >Limpiar registros</button>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
            No hay registros de prioridad manual. El sistema usa scoring automático en todas las convocatorias.
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "180px 1fr 1fr 80px",
              padding: "7px 14px", background: "var(--surface-2)",
              fontSize: 11, fontWeight: 700, color: "var(--subtle)", letterSpacing: "0.05em",
              textTransform: "uppercase", borderBottom: "1px solid var(--border-2)",
              borderRadius: "8px 8px 0 0",
            }}>
              <div>Fecha</div><div>Usuario</div><div>Sector / Sede</div><div style={{ textAlign: "center" }}>Cambios</div>
            </div>
            <div style={{ border: "1px solid var(--border-2)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
              {entries.map((e: PrioAuditEntry, i) => (
                <AuditoriaRow key={e.id} entry={e} fmtDt={fmtDt} odd={i % 2 !== 0} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditoriaRow({ entry, fmtDt, odd }: { entry: PrioAuditEntry; fmtDt: (s: string) => string; odd: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: "grid", gridTemplateColumns: "180px 1fr 1fr 80px",
          padding: "10px 14px", fontSize: 13, cursor: "pointer",
          background: odd ? "rgba(0,0,0,0.015)" : "transparent",
          borderTop: "1px solid var(--border-2)", alignItems: "center",
          transition: "background 0.1s",
        }}
      >
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmtDt(entry.timestamp)}</div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>{entry.actorName}</div>
          <div style={{ fontSize: 11, color: "var(--subtle)" }}>{entry.actorId}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>{entry.sector}</div>
          {entry.sede && <div style={{ fontSize: 11, color: "var(--subtle)" }}>{entry.sede}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          {entry.overrides.length > 0 ? (
            <span style={{
              padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: "rgba(217,119,6,0.12)", color: "rgb(160,90,0)",
              border: "1px solid rgba(217,119,6,0.25)",
            }}>{entry.overrides.length} ✏</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--subtle)" }}>Modo manual</span>
          )}
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--subtle)" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "12px 18px", background: "rgba(217,119,6,0.04)", borderTop: "1px dashed rgba(217,119,6,0.20)" }}>
          {entry.overrides.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
              El usuario eligió <b>modo manual</b> pero no modificó ninguna prioridad individualmente.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Prioridades modificadas
              </p>
              {entry.overrides.map((ov, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                  borderRadius: 7, background: "var(--surface)", border: "1px solid var(--border-2)",
                  fontSize: 12.5,
                }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", flex: 1 }}>{ov.medicoName}</span>
                  <span style={{ color: "var(--subtle)", fontSize: 11 }}>{ov.medicoId}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {ov.catPrio !== undefined && (
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>P{ov.catPrio} →</span>
                    )}
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: "rgba(217,119,6,0.12)", color: "rgb(160,90,0)",
                    }}>P{ov.overridePrio}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function pesoTotal(cfg: SystemConfig) {
  const s = cfg.scoring;
  return s.pesoAceptacion + s.pesoVelocidad + s.pesoPuntualidad + s.pesoDisponibilidad;
}

// ── Styles ────────────────────────────────────────────────────────────────
const sectionStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "20px 22px",
  boxShadow: "var(--shadow-sm)",
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text)",
};

const sectionDesc: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 13,
  color: "var(--muted)",
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  fontSize: 13.5,
  color: "var(--text)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
  fontFamily: "inherit",
};

const infoBoxStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  background: "var(--blue-tint)",
  border: "1px solid var(--border)",
  fontSize: 12.5,
  color: "var(--muted)",
  lineHeight: 1.5,
  marginBottom: 14,
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.12s",
};
