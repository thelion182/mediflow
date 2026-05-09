import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth, RequireCoord, RequireAdmin, RequireRole } from "./guards";
import { LoginPage } from "../auth/LoginPage";

import { SuplenciasDashboard } from "../modules/convocatorias/SuplenciasDashboard";
import { NuevaConvocatoria } from "../modules/convocatorias/NuevaConvocatoria";
import { DetalleConvocatoria } from "../modules/convocatorias/DetalleConvocatoria";
import { ReporteHoras } from "../modules/convocatorias/ReporteHoras";
import { AdminDashboard } from "../modules/admin/AdminDashboard";
import { MedicoHome } from "../modules/medico/MedicoHome";
import { ParteDiario } from "../modules/parte-diario/ParteDiario";
import { ConfigPage } from "../modules/config/ConfigPage";

function auth(role: "coord" | "admin" | "medico", element: React.ReactElement) {
  const guard =
    role === "coord"  ? <RequireCoord>{element}</RequireCoord>  :
    role === "admin"  ? <RequireAdmin>{element}</RequireAdmin>   :
                        <RequireRole roles="MEDICO">{element}</RequireRole>;
  return <RequireAuth>{guard}</RequireAuth>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },

  // ── Coordinación / Admin ──────────────────────────────────────────────
  { path: "/dashboard",                  element: auth("coord", <SuplenciasDashboard />) },
  { path: "/dashboard/nueva",            element: auth("coord", <NuevaConvocatoria />)   },
  { path: "/dashboard/c/:id",            element: auth("coord", <DetalleConvocatoria />) },
  { path: "/dashboard/reportes/horas",   element: auth("coord", <ReporteHoras />)        },
  { path: "/parte-diario",               element: auth("coord", <ParteDiario />)          },
  { path: "/admin",                      element: auth("coord", <AdminDashboard />)       },
  { path: "/config",                     element: auth("admin", <ConfigPage />)            },

  // ── Médico ────────────────────────────────────────────────────────────
  { path: "/medico", element: auth("medico", <MedicoHome />) },

  // ── Redirects legacy ─────────────────────────────────────────────────
  { path: "/suplencias",                element: <Navigate to="/dashboard" replace /> },
  { path: "/suplencias/nueva",          element: <Navigate to="/dashboard/nueva" replace /> },
  { path: "/suplencias/admin",          element: <Navigate to="/admin" replace /> },
  { path: "/suplencias/reportes/horas", element: <Navigate to="/dashboard/reportes/horas" replace /> },
  { path: "/suplencias/c/:id",          element: <Navigate to="/dashboard" replace /> },

  // ── Catch-all ─────────────────────────────────────────────────────────
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
