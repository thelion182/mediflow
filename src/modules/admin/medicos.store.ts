import { storage } from "../../core/storage";
import type { Medico, MedicoTipo, MedicoGremio } from "./medicos.types";

const KEY = "mediflow.catalogo.medicos.v4";

const ALL    = ["CAI","GUARDIA_FILIAL","PISO","POLICLINICA","PUERTA_EMERGENCIA","REP_MEDICAMENTOS","RETEN","URG_DOMICILIARIA"];
const EMG    = ["PUERTA_EMERGENCIA","GUARDIA_FILIAL","CAI"];
const PISO_PC= ["PISO","POLICLINICA"];
const GIN    = ["PISO","GUARDIA_FILIAL"];
const CARD   = ["POLICLINICA","PISO","CAI"];
const PED    = ["POLICLINICA","URG_DOMICILIARIA"];
const TRAUMA = ["PUERTA_EMERGENCIA","PISO"];
const PSIQ   = ["POLICLINICA","RETEN"];
const DERM   = ["POLICLINICA","RETEN"];
const ENDO   = ["POLICLINICA","REP_MEDICAMENTOS"];
const ONCO   = ["PISO","POLICLINICA"];

// ── Seed original (22 médicos con IDs de login) ────────────────────────────
const ORIGINAL_22: Medico[] = [
  // TITULARES
  { userId:"F-93598",    displayName:"Dra. Laura Redondo",    funcionario:"93598",  cedula:"42187634", especialidad:"Cardiología",       tipo:"TITULAR",       gremio:"SMU", prioridad:1,  telefono:"+59892100001", activo:true, sectoresHabilitados:CARD,      scoreManual:{ tecnico:"EXCELENTE", postgrado:"COMPLETO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:12, penalizacionGuardiaFija:0 },
  { userId:"F-10021",    displayName:"Dr. Martín Sosa",       funcionario:"10021",  cedula:"31450022", especialidad:"Medicina General",  tipo:"TITULAR",       gremio:"SMU", prioridad:2,  telefono:"+59892100002", activo:true, sectoresHabilitados:ALL,       scoreManual:{ tecnico:"EXCELENTE", postgrado:"COMPLETO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:8,  penalizacionGuardiaFija:0 },
  { userId:"F-10045",    displayName:"Dra. Gabriela Ferreira",funcionario:"10045",  cedula:"29876543", especialidad:"Pediatría",         tipo:"TITULAR",       gremio:"SMU", prioridad:3,  telefono:"+59892100003", activo:true, sectoresHabilitados:PED,       scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:6,  penalizacionGuardiaFija:0 },
  { userId:"F-10078",    displayName:"Dr. Rodrigo Bentancur", funcionario:"10078",  cedula:"38901234", especialidad:"Emergentología",    tipo:"TITULAR",       gremio:"SMU", prioridad:4,  telefono:"+59892100004", activo:true, sectoresHabilitados:EMG,       scoreManual:{ tecnico:"EXCELENTE", postgrado:"EN_CURSO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:4,  penalizacionGuardiaFija:0 },
  { userId:"F-10102",    displayName:"Dra. Sofía Álvarez",    funcionario:"10102",  cedula:"45678901", especialidad:"Ginecología",       tipo:"TITULAR",       gremio:"SAQ", prioridad:5,  telefono:"+59892100005", activo:true, sectoresHabilitados:GIN,       scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:7,  penalizacionGuardiaFija:0 },
  { userId:"F-10130",    displayName:"Dr. Federico Núñez",    funcionario:"10130",  cedula:"27654321", especialidad:"Traumatología",     tipo:"TITULAR",       gremio:"SAQ", prioridad:6,  telefono:"+59892100006", activo:true, sectoresHabilitados:TRAUMA,    scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",  relacionamiento:"REGULAR", quejas:"NINGUNA"    }, antiguedadAnios:5,  penalizacionGuardiaFija:0 },
  { userId:"F-10155",    displayName:"Dra. Patricia Montero", funcionario:"10155",  cedula:"33412089", especialidad:"Neurología",        tipo:"TITULAR",       gremio:"SMU", prioridad:7,  telefono:"+59892100007", activo:true, sectoresHabilitados:PISO_PC,   scoreManual:{ tecnico:"EXCELENTE", postgrado:"COMPLETO",  relacionamiento:"BUENO",   quejas:"NINGUNA"    }, antiguedadAnios:10, penalizacionGuardiaFija:0 },
  // SUPLENTES
  { userId:"CI-48206484",displayName:"Dr. Diego Suárez",      cedula:"48206484", especialidad:"Medicina General",  tipo:"SUPLENTE", gremio:"SMU", prioridad:10, telefono:"+59892100010", activo:true, sectoresHabilitados:ALL,    scoreManual:{ tecnico:"BUENO",     postgrado:"EN_CURSO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:3,  penalizacionGuardiaFija:0 },
  { userId:"CI-19904039",displayName:"Dr. Pablo Cardoso",     cedula:"19904039", especialidad:"Medicina General",  tipo:"SUPLENTE", gremio:"SMU", prioridad:11, telefono:"+59892100011", activo:true, sectoresHabilitados:ALL,    scoreManual:{ tecnico:"BUENO",     postgrado:"NO_REALIZA", relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:2,  penalizacionGuardiaFija:0 },
  { userId:"CI-52301876",displayName:"Dra. Valentina Sánchez",cedula:"52301876", especialidad:"Pediatría",         tipo:"SUPLENTE", gremio:"SMU", prioridad:12, telefono:"+59892100012", activo:true, sectoresHabilitados:PED,    scoreManual:{ tecnico:"REGULAR",   postgrado:"EN_CURSO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:1,  penalizacionGuardiaFija:0 },
  { userId:"CI-41098765",displayName:"Dr. Nicolás Herrera",   cedula:"41098765", especialidad:"Emergentología",    tipo:"SUPLENTE", gremio:"SMU", prioridad:13, telefono:"+59892100013", activo:true, sectoresHabilitados:EMG,    scoreManual:{ tecnico:"BUENO",     postgrado:"EN_CURSO",   relacionamiento:"REGULAR", quejas:"NINGUNA"     }, antiguedadAnios:2,  penalizacionGuardiaFija:0 },
  { userId:"CI-36754210",displayName:"Dra. Camila Vega",      cedula:"36754210", especialidad:"Ginecología",       tipo:"SUPLENTE", gremio:"SAQ", prioridad:14, telefono:"+59892100014", activo:true, sectoresHabilitados:GIN,    scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:4,  penalizacionGuardiaFija:0 },
  { userId:"CI-44509321",displayName:"Dr. Andrés Morales",    cedula:"44509321", especialidad:"Gastroenterología", tipo:"SUPLENTE", gremio:"SMU", prioridad:15, telefono:"+59892100015", activo:true, sectoresHabilitados:PISO_PC,scoreManual:{ tecnico:"EXCELENTE", postgrado:"COMPLETO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:9,  penalizacionGuardiaFija:0 },
  { userId:"CI-29871034",displayName:"Dra. Luciana Pereira",  cedula:"29871034", especialidad:"Cardiología",       tipo:"SUPLENTE", gremio:"SMU", prioridad:16, telefono:"+59892100016", activo:true, sectoresHabilitados:CARD,   scoreManual:{ tecnico:"BUENO",     postgrado:"EN_CURSO",   relacionamiento:"BUENO",   quejas:"RECURRENTES" }, antiguedadAnios:3,  penalizacionGuardiaFija:0 },
  { userId:"CI-55234098",displayName:"Dr. Tomás Ríos",        cedula:"55234098", especialidad:"Traumatología",     tipo:"SUPLENTE", gremio:"SAQ", prioridad:17, telefono:"+59892100017", activo:true, sectoresHabilitados:TRAUMA, scoreManual:{ tecnico:"BUENO",     postgrado:"NO_REALIZA", relacionamiento:"REGULAR", quejas:"NINGUNA"     }, antiguedadAnios:1,  penalizacionGuardiaFija:0 },
  { userId:"CI-38907612",displayName:"Dra. Florencia Castro", cedula:"38907612", especialidad:"Dermatología",      tipo:"SUPLENTE", gremio:"SMU", prioridad:18, telefono:"+59892100018", activo:true, sectoresHabilitados:DERM,   scoreManual:{ tecnico:"REGULAR",   postgrado:"EN_CURSO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:2,  penalizacionGuardiaFija:0 },
  { userId:"CI-47321056",displayName:"Dr. Ignacio Méndez",    cedula:"47321056", especialidad:"Psiquiatría",       tipo:"SUPLENTE", gremio:"SMU", prioridad:19, telefono:"+59892100019", activo:true, sectoresHabilitados:PSIQ,   scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:6,  penalizacionGuardiaFija:0 },
  // INDEPENDIENTES
  { userId:"CI-31045678",displayName:"Dr. Alejandro Rojas",   cedula:"31045678", especialidad:"Oncología",         tipo:"INDEPENDIENTE", gremio:"SMU", prioridad:25, telefono:"+59892100025", activo:true, sectoresHabilitados:ONCO,  scoreManual:{ tecnico:"EXCELENTE", postgrado:"COMPLETO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:15, penalizacionGuardiaFija:0 },
  { userId:"CI-42765430",displayName:"Dra. Natalia Ibáñez",   cedula:"42765430", especialidad:"Endocrinología",    tipo:"INDEPENDIENTE", gremio:"SMU", prioridad:26, telefono:"+59892100026", activo:true, sectoresHabilitados:ENDO,  scoreManual:{ tecnico:"BUENO",     postgrado:"COMPLETO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:8,  penalizacionGuardiaFija:0 },
  { userId:"CI-58123904",displayName:"Dr. Sebastián Lema",    cedula:"58123904", especialidad:"Medicina General",  tipo:"INDEPENDIENTE", gremio:"SMU", prioridad:27, telefono:"+59892100027", activo:true, sectoresHabilitados:ALL,   scoreManual:{ tecnico:"BUENO",     postgrado:"NO_REALIZA", relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:2,  penalizacionGuardiaFija:0 },
  { userId:"CI-24507891",displayName:"Dra. Mariana Otero",    cedula:"24507891", especialidad:"Neurología",        tipo:"INDEPENDIENTE", gremio:"SMU", prioridad:28, telefono:"+59892100028", activo:true, sectoresHabilitados:PISO_PC,scoreManual:{ tecnico:"REGULAR",   postgrado:"EN_CURSO",   relacionamiento:"REGULAR", quejas:"NINGUNA"     }, antiguedadAnios:1,  penalizacionGuardiaFija:0 },
  { userId:"CI-61023487",displayName:"Dr. Gustavo Acosta",    cedula:"61023487", especialidad:"Emergentología",    tipo:"INDEPENDIENTE", gremio:"SMU", prioridad:29, telefono:"+59892100029", activo:true, sectoresHabilitados:EMG,   scoreManual:{ tecnico:"BUENO",     postgrado:"EN_CURSO",   relacionamiento:"BUENO",   quejas:"NINGUNA"     }, antiguedadAnios:3,  penalizacionGuardiaFija:0 },
];

// ── Generador de 978 médicos demo ──────────────────────────────────────────
function buildDemoMedicos(): Medico[] {
  const NF = ["María","Ana","Laura","Sofía","Gabriela","Patricia","Valentina","Camila","Luciana","Florencia","Natalia","Mariana","Carolina","Adriana","Verónica","Claudia","Romina","Daniela","Silvana","Cecilia","Alejandra","Vanesa","Paola","Beatriz","Graciela","Marta","Elena","Sandra","Lorena","Viviana","Mónica","Cristina","Susana","Alicia","Rosa","Andrea","Carla","Fernanda","Inés","Julia","Karen","Liliana","Nadia","Paula","Rebeca","Silvia","Teresa","Ximena","Dolores","Esperanza"];
  const NM = ["Juan","Carlos","Luis","Miguel","José","Diego","Martín","Pablo","Andrés","Tomás","Federico","Rodrigo","Nicolás","Ignacio","Sebastián","Alejandro","Gustavo","Ricardo","Roberto","Eduardo","Guillermo","Fernando","Hernán","Mario","Sergio","Daniel","Hugo","Oscar","Rafael","Adrián","Héctor","Emilio","Raúl","Ernesto","Víctor","Alberto","Arturo","Enrique","Felipe","Gabriel","Jorge","Julián","Leonardo","Manuel","Mauricio","Pedro","Renzo","Santiago","Valentín","Ramiro"];
  const AP = ["García","Rodríguez","López","Martínez","González","Pérez","Sánchez","Ramírez","Torres","Flores","Rivera","Gómez","Díaz","Morales","Jiménez","Rojas","Herrera","Castro","Vargas","Mendoza","Ramos","Ortega","Romero","Ríos","Silva","Vega","Reyes","Moreno","Suárez","Miranda","Ferreira","Olivera","Acosta","Núñez","Pereira","Méndez","Bentancur","Álvarez","Montero","Lema","Ibáñez","Cardoso","Sosa","Redondo","Otero","Cabrera","Espinoza","Fuentes","Medina","Aguilar","Barrios","Campos","Correa","Delgado","Domínguez","Estrada","Figueroa","Gudé","Iturbe","Larrañaga"];

  const ESPS: [string, string[]][] = [
    ["Cardiología",CARD],      ["Pediatría",PED],          ["Medicina General",ALL],
    ["Emergentología",EMG],    ["Ginecología",GIN],         ["Traumatología",TRAUMA],
    ["Neurología",PISO_PC],    ["Gastroenterología",PISO_PC],["Dermatología",DERM],
    ["Psiquiatría",PSIQ],      ["Oncología",ONCO],          ["Endocrinología",ENDO],
    ["Anestesiología",ALL],    ["Oftalmología",PISO_PC],    ["Urología",PISO_PC],
    ["Cirugía",ALL],           ["Medicina Interna",PISO_PC],["Reumatología",PISO_PC],
    ["Nefrología",PISO_PC],    ["Neumología",PISO_PC],      ["Otorrinolaringología",PISO_PC],
  ];

  const TECN  = ["EXCELENTE","BUENO","BUENO","REGULAR"]          as const;
  const POST  = ["COMPLETO","COMPLETO","EN_CURSO","NO_REALIZA"]  as const;
  const REL   = ["BUENO","BUENO","REGULAR"]                      as const;
  const QUEJ  = ["NINGUNA","NINGUNA","NINGUNA","RECURRENTES"]    as const;

  const result: Medico[] = [];
  let titPrio = 8, supPrio = 300, indPrio = 800;

  for (let i = 0; i < 978; i++) {
    const fem     = i % 2 === 0;
    const ni      = Math.floor(i / 2) % (fem ? NF.length : NM.length);
    const a1i     = i % AP.length;
    const a2i     = (i * 11 + 3) % AP.length;
    const nombre  = fem ? NF[ni] : NM[ni];
    const apellido = a1i !== a2i ? `${AP[a1i]} ${AP[a2i]}` : AP[a1i];
    const displayName = `${fem ? "Dra." : "Dr."} ${nombre} ${apellido}`;

    const tm                  = i % 10;
    const tipo: MedicoTipo    = tm < 3 ? "TITULAR" : tm < 8 ? "SUPLENTE" : "INDEPENDIENTE";
    const gremio: MedicoGremio = i % 10 < 7 ? "SMU" : "SAQ";
    const [esp, sects]        = ESPS[i % ESPS.length];

    let prioridad: number;
    if (tipo === "TITULAR")       prioridad = titPrio++;
    else if (tipo === "SUPLENTE") prioridad = supPrio++;
    else                          prioridad = indPrio++;

    const ci = (10_000_001 + i).toString();

    result.push({
      userId:      `CI-${ci}`,
      displayName,
      cedula:      ci,
      funcionario: tipo !== "INDEPENDIENTE" ? (20_001 + i).toString() : undefined,
      especialidad: esp,
      telefono:    `+5989${String(2_200_000 + i).padStart(7, "0")}`,
      tipo,
      gremio,
      prioridad,
      sectoresHabilitados: sects,
      scoreManual: {
        tecnico:         TECN[i % TECN.length],
        postgrado:       POST[i % POST.length],
        relacionamiento: REL[i % REL.length],
        quejas:          QUEJ[i % QUEJ.length],
      },
      antiguedadAnios:         (i % 20) + 1,
      penalizacionGuardiaFija: 0,
      activo: (i % 15) !== 0,
    });
  }
  return result;
}

const DEFAULT: Medico[] = [...ORIGINAL_22, ...buildDemoMedicos()];

// ── Helpers ────────────────────────────────────────────────────────────────
function prioEffective(n?: number) {
  return typeof n === "number" && isFinite(n) ? n : 9999;
}
function normalizeTipo(t?: MedicoTipo): MedicoTipo {
  return t ?? "SUPLENTE";
}
function normalizeGremio(g?: MedicoGremio): MedicoGremio {
  return g ?? "SMU";
}
function normalizePrioridad(n?: number): number | undefined {
  if (typeof n !== "number" || !isFinite(n)) return undefined;
  const v = Math.floor(n);
  return v < 1 ? 1 : v;
}
function normalizeMedico(m: Medico): Medico {
  return {
    ...m,
    displayName: (m.displayName || "").trim(),
    cedula:      (m.cedula || "").trim() || undefined,
    funcionario: (m.funcionario || "").trim() || undefined,
    especialidad:(m.especialidad || "").trim() || undefined,
    telefono:    (m.telefono || "").trim() || undefined,
    tipo:    normalizeTipo(m.tipo),
    gremio:  normalizeGremio(m.gremio),
    prioridad: normalizePrioridad(m.prioridad),
    sectoresHabilitados: m.sectoresHabilitados ?? [],
    activo: m.activo ?? true,
  };
}

export const medicosStore = {
  list(): Medico[] {
    const raw  = storage.get<Medico[]>(KEY, []);
    const base = raw.length === 0 ? DEFAULT : raw;
    return base
      .map(normalizeMedico)
      .sort((a, b) => {
        const pa = prioEffective(a.prioridad);
        const pb = prioEffective(b.prioridad);
        if (pa !== pb) return pa - pb;
        return (a.displayName || "").localeCompare(b.displayName || "");
      });
  },

  saveAll(items: Medico[]) {
    storage.set(KEY, items.map(normalizeMedico));
  },

  upsert(m: Medico) {
    const raw  = storage.get<Medico[]>(KEY, []);
    const base = raw.length ? raw : DEFAULT.slice();
    const item = normalizeMedico(m);
    const idx  = base.findIndex(x => x.userId === item.userId);
    if (idx >= 0) base[idx] = normalizeMedico({ ...base[idx], ...item });
    else base.unshift(item);
    storage.set(KEY, base);
  },

  remove(userId: string) {
    const raw  = storage.get<Medico[]>(KEY, []);
    const base = raw.length ? raw : DEFAULT;
    storage.set(KEY, base.filter(m => m.userId !== userId));
  },

  getById(userId: string): Medico | null {
    return this.list().find(m => m.userId === userId) ?? null;
  },
};
