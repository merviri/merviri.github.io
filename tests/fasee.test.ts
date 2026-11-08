import { horarioDelDia, type Evento, type Horario } from "../src/dominio/calendario";
import { CATALOGO, FECHAS_ESPECIALES, proximaVez } from "../src/dominio/ideas";
import { encajaFecha, filtrar, FILTRO_INICIAL, PLAN_VACIO, problemaPlan, textoReserva, type Ganas, type Plan } from "../src/dominio/planes";
import { cabe, huecos, libresComunes, momentosDe, ocupado, recomendar, tiempoEncaja, type Prevision } from "../src/dominio/recomendar";
import { convertir, normalizarHora } from "../src/servicios/agenda";
import { distanciaKm, SITIOS_CERCA } from "../src/servicios/sitios";

const plan = (p: Partial<Plan>): Plan => ({ id: "x", titulo: "Plan", ...PLAN_VACIO, ...p });
const ev = (e: Partial<Evento>): Evento => ({
  id: "e", titulo: "Algo", quien: "ambas", categoria: "plan", inicio: "2026-11-14", fin: "2026-11-14", todoElDia: false,
  horaInicio: "10:00", horaFin: "12:00", lugar: null, notas: null, repeticion: null, hasta: null, excepciones: [], privado: false, aviso: "ninguno", ...e,
});
const trabajo = (p: "p1" | "p2"): Horario => ({ id: p, bloques: [{ dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "15:00", etiqueta: "Trabajo" }] });

describe("huecos libres de las dos", () => {
  it("cuenta eventos de cada una, de las dos y el horario habitual", () => {
    const eventos = [ev({ quien: "p2", horaInicio: "17:00", horaFin: "18:30", inicio: "2026-11-09", fin: "2026-11-09" })];
    expect(ocupado("2026-11-09", "p1", eventos, trabajo("p1"))).toEqual([[480, 900]]);
    // Lunes: p1 trabaja hasta las 15:00 y p2 tiene algo de 17:00 a 18:30.
    expect(libresComunes("2026-11-09", eventos, { p1: trabajo("p1"), p2: trabajo("p2") })).toEqual([[900, 1020], [1110, 1380]]);
  });

  it("los cumpleaños no ocupan el día; otras cosas de todo el día sí", () => {
    const cumple = ev({ todoElDia: true, horaInicio: null, horaFin: null, categoria: "cumple" });
    const boda = ev({ todoElDia: true, horaInicio: null, horaFin: null, categoria: "familia" });
    expect(libresComunes("2026-11-14", [cumple], {})).toEqual([[540, 1380]]);
    expect(libresComunes("2026-11-14", [boda], {})).toEqual([]);
  });

  it("detecta días libres, fines de semana y puentes", () => {
    const hs = huecos("2026-11-09", 14, [], { p1: trabajo("p1"), p2: trabajo("p2") });
    expect(hs.filter((x) => x.tipo === "finde").map((x) => x.dia)).toEqual(["2026-11-14", "2026-11-21"]);
    expect(hs.find((x) => x.dia === "2026-11-10")?.tipo).toBe("media"); // tarde de 15:00 a 23:00 = 8 h
    const sinTrabajo = huecos("2026-12-05", 4, [], {});
    expect(sinTrabajo.some((x) => x.tipo === "viaje" && x.dia === "2026-12-05" && x.hastaDia === "2026-12-08")).toBe(true);
  });

  it("las vacaciones anulan el horario habitual de esa persona (y no ocupan)", () => {
    const vacas = ev({ id: "v", titulo: "Vacaciones", categoria: "vacaciones", quien: "p1", todoElDia: true, horaInicio: null, horaFin: null, inicio: "2026-11-16", fin: "2026-11-20" });
    // Lunes de vacaciones: Elvira libre todo el día; María sigue trabajando.
    expect(ocupado("2026-11-16", "p1", [vacas], trabajo("p1"))).toEqual([]);
    expect(ocupado("2026-11-16", "p2", [vacas], trabajo("p2"))).toEqual([[480, 900]]);
    expect(horarioDelDia(trabajo("p1"), "2026-11-16", "p1", [vacas])).toEqual([]);
    expect(horarioDelDia(trabajo("p1"), "2026-11-23", "p1", [vacas])).toEqual([{ desde: 480, hasta: 900, etiqueta: "Trabajo" }]);
    // Si son de las dos (o María no trabaja), salen días enteros y un hueco de viaje.
    const ambas = { ...vacas, quien: "ambas" as const };
    const hs = huecos("2026-11-14", 9, [ambas], { p1: trabajo("p1"), p2: trabajo("p2") });
    expect(hs.some((x) => x.tipo === "viaje" && x.dia === "2026-11-14" && x.hastaDia === "2026-11-22")).toBe(true);
  });

  it("una tarde libre quita solo esas horas del horario", () => {
    const tarde = ev({ id: "t", titulo: "Tarde libre", categoria: "vacaciones", quien: "p1", horaInicio: "12:00", horaFin: "15:00", inicio: "2026-11-17", fin: "2026-11-17" });
    expect(horarioDelDia(trabajo("p1"), "2026-11-17", "p1", [tarde])).toEqual([{ desde: 480, hasta: 720, etiqueta: "Trabajo" }]);
    // Un hueco en medio de la jornada parte el bloque en dos.
    const medico = { ...tarde, horaInicio: "10:00", horaFin: "11:00" };
    expect(horarioDelDia(trabajo("p1"), "2026-11-17", "p1", [medico])).toEqual([
      { desde: 480, hasta: 600, etiqueta: "Trabajo" }, { desde: 660, hasta: 900, etiqueta: "Trabajo" },
    ]);
    expect(ocupado("2026-11-17", "p1", [tarde], trabajo("p1"))).toEqual([[480, 720]]);
  });

  it("qué cabe en cada hueco y en qué momento", () => {
    expect(cabe("rato", "media")).toBe(true);
    expect(cabe("dia", "media")).toBe(false);
    expect(cabe("finde", "dia")).toBe(false);
    expect(cabe("finde", "viaje")).toBe(true);
    expect(cabe("rato", "finde")).toBe(false);
    expect(momentosDe({ desde: 15 * 60, hasta: 23 * 60, tipo: "media" })).toEqual(["tarde", "noche"]);
  });

  it("el tiempo manda", () => {
    const p = (codigo: number, max: number, lluvia: number): Prevision => ({ fecha: "2026-11-14", codigo, max, min: 0, lluvia });
    expect(tiempoEncaja("da-igual", null)).toBe(true);
    expect(tiempoEncaja("sin-lluvia", null)).toBeNull();
    expect(tiempoEncaja("sin-lluvia", p(61, 15, 80))).toBe(false);
    expect(tiempoEncaja("sol", p(1, 22, 5))).toBe(true);
    expect(tiempoEncaja("sol", p(1, 12, 5))).toBe(false);
    expect(tiempoEncaja("frio", p(71, 2, 60))).toBe(true);
  });
});

describe("recomendador", () => {
  const horarios = { p1: trabajo("p1"), p2: trabajo("p2") };
  const ganas: Ganas[] = [
    { id: "a:p1", plan: "a", persona: "p1", ganas: 3 }, { id: "a:p2", plan: "a", persona: "p2", ganas: 3 },
    { id: "b:p1", plan: "b", persona: "p1", ganas: 0 }, { id: "b:p2", plan: "b", persona: "p2", ganas: 0 },
  ];

  it("propone primero lo que más ganas da, en un hueco donde cabe", () => {
    const s = recomendar({
      planes: [plan({ id: "a", titulo: "Ruta", duracion: "dia" }), plan({ id: "c", titulo: "Cine", duracion: "rato" }), plan({ id: "b", titulo: "Nada" })],
      ganas, eventos: [], horarios, hoy: "2026-11-09", dias: 14, tiempo: () => null,
    });
    expect(s.map((x) => x.plan.id)).toEqual(["a", "c"]);
    expect(s[0]!.hueco.tipo).toBe("dia");
    expect(["2026-11-14", "2026-11-15"]).toContain(s[0]!.hueco.dia);
  });

  it("respeta la reserva, la temporada, las fechas fijas y el tiempo", () => {
    const base = { ganas: [], eventos: [], horarios, hoy: "2026-11-09", dias: 14 };
    expect(recomendar({ ...base, planes: [plan({ id: "r", reservaDias: 30 })], tiempo: () => null })).toEqual([]);
    const conReserva = recomendar({ ...base, planes: [plan({ id: "r", reservaDias: 3 })], tiempo: () => null });
    expect(conReserva[0]!.reservarAntesDe).toBeTruthy();
    expect(recomendar({ ...base, planes: [plan({ id: "v", meses: [7] })], tiempo: () => null })).toEqual([]);
    const fija = recomendar({ ...base, planes: [plan({ id: "f", desde: "2026-11-20", hasta: "2026-11-20", duracion: "rato" })], tiempo: () => null });
    expect(fija[0]!.hueco.dia).toBe("2026-11-20");
    const lluvia = (_p: Plan, f: string): Prevision => ({ fecha: f, codigo: 63, max: 12, min: 5, lluvia: 90 });
    expect(recomendar({ ...base, planes: [plan({ id: "s", clima: "sin-lluvia" })], tiempo: lluvia })).toEqual([]);
  });
});

describe("planes", () => {
  it("valida y filtra", () => {
    expect(problemaPlan(plan({}))).toBeNull();
    expect(problemaPlan(plan({ titulo: " " }))).toMatch(/nombre/);
    expect(problemaPlan(plan({ enlace: "javascript:alert(1)" }))).toMatch(/http/);
    expect(problemaPlan(plan({ desde: "2026-11-10", hasta: "2026-11-01" }))).toMatch(/final/);
    const ps = [plan({ id: "1", titulo: "Cine", coste: "bajo" }), plan({ id: "2", titulo: "Picnic", coste: "gratis", clima: "sol" })];
    expect(filtrar(ps, { ...FILTRO_INICIAL, gratis: true }).map((p) => p.id)).toEqual(["2"]);
    expect(filtrar(ps, { ...FILTRO_INICIAL, cubierto: true }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrar(ps, { ...FILTRO_INICIAL, texto: "pic" }).map((p) => p.id)).toEqual(["2"]);
    expect(encajaFecha(plan({ meses: [12, 1] }), "2026-12-20")).toBe(true);
    expect(textoReserva(14)).toBe("Reservar 2 semanas antes");
  });
});

describe("descubrir", () => {
  it("el catálogo no tiene ids repetidos y las fechas especiales tienen próxima vez", () => {
    expect(new Set(CATALOGO.map((i) => i.id)).size).toBe(CATALOGO.length);
    for (const f of FECHAS_ESPECIALES) {
      const p = proximaVez(f, "2026-11-07");
      if (f.fija) continue;
      expect(p).not.toBeNull();
      expect(p![0] <= p![1]).toBe(true);
    }
    expect(proximaVez(FECHAS_ESPECIALES.find((f) => f.id === "perseidas")!, "2026-11-07")).toEqual(["2027-08-11", "2027-08-13"]);
    expect(proximaVez(FECHAS_ESPECIALES.find((f) => f.id === "eclipse-2027")!, "2027-08-03")).toBeNull();
  });

  it("convierte la agenda de la Junta", () => {
    expect(normalizarHora("18:30 h")).toBe("18:30");
    expect(normalizarHora("9.00")).toBe("09:00");
    const e = convertir({ id_evento: 1, titulo: " Concierto ", categoria: "Conciertos", fecha_inicio: "2026-11-19", hora_inicio: "20:00 h",
      destinatarios: "Público infantil", enlace_contenido: "javascript:x" })!;
    expect(e).toMatchObject({ titulo: "Concierto", inicio: "2026-11-19", hora: "20:00", infantil: true, enlace: null });
    expect(convertir({ titulo: "x", fecha_inicio: "no" })).toBeNull();
  });

  it("sitios cercanos", () => {
    expect(new Set(SITIOS_CERCA.map((s) => s.id)).size).toBe(SITIOS_CERCA.length);
    expect(SITIOS_CERCA[0]!.km).toBeLessThanOrEqual(SITIOS_CERCA[SITIOS_CERCA.length - 1]!.km);
    expect(Math.round(distanciaKm({ lat: 41.6523, lon: -4.7245 }, { lat: 40.9481, lon: -4.1184 }))).toBeGreaterThan(80); // Segovia
  });
});
