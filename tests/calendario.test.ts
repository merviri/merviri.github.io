import { planificar, type Suscripcion } from "../src/dominio/avisos";
import {
  bloquesDelDia,
  cuadriculaMes,
  delDia,
  diaSemana,
  inicioSemana,
  ocurrencias,
  problemaBloque,
  problemaEvento,
  rutaDeEvento,
  sumarMeses,
  sumarRepeticion,
  textoHora,
  visibleComo,
  type Evento,
} from "../src/dominio/calendario";
import { PAREJA_INICIAL } from "../src/dominio/pareja";

const ev = (e: Partial<Evento>): Evento => ({
  id: "e", titulo: "Cena", quien: "ambas", categoria: "plan", inicio: "2026-11-14", fin: "2026-11-14",
  todoElDia: false, horaInicio: "21:00", horaFin: "23:00", lugar: null, notas: null,
  repeticion: null, hasta: null, excepciones: [], privado: false, aviso: "ninguno", ...e,
});

describe("calendario: repeticiones", () => {
  it("suma meses y años sin arrastrar el ajuste de fin de mes", () => {
    const mensual = { cada: 1, unidad: "mes" as const };
    expect(sumarRepeticion("2026-01-31", mensual, 1)).toBe("2026-02-28");
    expect(sumarRepeticion("2026-01-31", mensual, 2)).toBe("2026-03-31");
    expect(sumarRepeticion("2024-02-29", { cada: 1, unidad: "anio" }, 1)).toBe("2025-02-28");
    expect(sumarRepeticion("2024-02-29", { cada: 1, unidad: "anio" }, 4)).toBe("2028-02-29");
  });

  it("ocurrencias de un evento semanal, con excepción y fin", () => {
    const e = ev({ inicio: "2026-11-02", fin: "2026-11-02", repeticion: { cada: 1, unidad: "semana" }, excepciones: ["2026-11-16"], hasta: "2026-12-01" });
    expect(ocurrencias(e, "2026-11-01", "2026-12-31").map((o) => o.dia)).toEqual(["2026-11-02", "2026-11-09", "2026-11-23", "2026-11-30"]);
    // Empezar mucho después del inicio no se salta ninguna.
    const largo = ev({ inicio: "2020-01-06", fin: "2020-01-06", repeticion: { cada: 2, unidad: "semana" } });
    expect(ocurrencias(largo, "2026-11-01", "2026-11-30").map((o) => o.dia)).toEqual(["2026-11-02", "2026-11-16", "2026-11-30"]);
  });

  it("cumpleaños cada año y eventos de varios días", () => {
    const cumple = ev({ inicio: "1990-03-15", fin: "1990-03-15", todoElDia: true, horaInicio: null, horaFin: null, repeticion: { cada: 1, unidad: "anio" } });
    expect(ocurrencias(cumple, "2026-01-01", "2027-12-31").map((o) => o.dia)).toEqual(["2026-03-15", "2027-03-15"]);
    const viaje = ev({ inicio: "2026-11-27", fin: "2026-11-30", todoElDia: true, horaInicio: null, horaFin: null });
    expect(ocurrencias(viaje, "2026-11-29", "2026-11-29")).toHaveLength(1);
    expect(ocurrencias(viaje, "2026-12-01", "2026-12-05")).toHaveLength(0);
  });

  it("lo de un día: primero lo de todo el día, luego por hora", () => {
    const d = delDia([
      ev({ id: "b", titulo: "Cena", horaInicio: "21:00" }),
      ev({ id: "a", titulo: "Dentista", horaInicio: "10:00", horaFin: null }),
      ev({ id: "c", titulo: "Viaje", inicio: "2026-11-13", fin: "2026-11-15", todoElDia: true, horaInicio: null, horaFin: null }),
    ], "2026-11-14");
    expect(d.map((o) => o.evento.id)).toEqual(["c", "a", "b"]);
    expect(textoHora(d[1]!, "2026-11-14")).toBe("10:00");
    expect(textoHora(d[2]!, "2026-11-14")).toBe("21:00–23:00");
    expect(textoHora(d[0]!, "2026-11-14")).toBe("Todo el día");
    expect(textoHora(d[0]!, "2026-11-15")).toBe("Último día");
  });
});

describe("calendario: privacidad, validación y ficheros", () => {
  it("la otra ve «Ocupada» sin detalles", () => {
    const e = ev({ quien: "p1", privado: true, titulo: "Comprar regalo", lugar: "Centro" });
    expect(visibleComo(e, "p2")).toMatchObject({ titulo: "Ocupada", lugar: null });
    expect(visibleComo(e, "p1").titulo).toBe("Comprar regalo");
  });

  it("valida", () => {
    expect(problemaEvento(ev({}))).toBeNull();
    expect(problemaEvento(ev({ titulo: " " }))).toMatch(/nombre/);
    expect(problemaEvento(ev({ fin: "2026-11-13" }))).toMatch(/final/);
    expect(problemaEvento(ev({ horaFin: "20:00" }))).toMatch(/antes/);
    expect(problemaEvento(ev({ horaInicio: null }))).toMatch(/hora de inicio/);
    expect(problemaEvento(ev({ privado: true, quien: "ambas" }))).toMatch(/privado/);
  });

  it("cada evento va a su fichero", () => {
    expect(rutaDeEvento(ev({}))).toBe("datos/calendario/2026.json");
    expect(rutaDeEvento(ev({ repeticion: { cada: 1, unidad: "anio" } }))).toBe("datos/calendario/repetidos.json");
  });
});

describe("calendario: semanas, meses y horario", () => {
  it("semanas de lunes a domingo", () => {
    expect(diaSemana("2026-11-07")).toBe(6); // sábado
    expect(diaSemana("2026-11-08")).toBe(7); // domingo
    expect(inicioSemana("2026-11-08")).toBe("2026-11-02");
    const c = cuadriculaMes("2026-11-20");
    expect(c).toHaveLength(42);
    expect(c[0]).toBe("2026-10-26");
    expect(c).toContain("2026-11-30");
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-01");
    expect(sumarMeses("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("horario habitual", () => {
    const h = { id: "p1" as const, bloques: [{ dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "15:00", etiqueta: "Trabajo" }] };
    expect(bloquesDelDia(h, "2026-11-09")).toHaveLength(1); // lunes
    expect(bloquesDelDia(h, "2026-11-08")).toHaveLength(0); // domingo
    expect(problemaBloque({ dias: [], desde: "08:00", hasta: "15:00", etiqueta: "" })).toMatch(/día/);
    expect(problemaBloque({ dias: [1], desde: "15:00", hasta: "08:00", etiqueta: "" })).toMatch(/después/);
  });
});

describe("avisos del calendario", () => {
  const sub = (id: string, persona: "p1" | "p2", tipos = {}): Suscripcion =>
    ({ id, persona, nombre: id, endpoint: "https://fcm.googleapis.com/x", p256dh: "", auth: "", prefs: { tipos, silencioDesde: null, silencioHasta: null } });

  it("el resumen de la mañana incluye los planes del día de cada una", () => {
    const plan = planificar({
      tareas: [], pareja: PAREJA_INICIAL,
      eventos: [ev({ titulo: "Cena", inicio: "2026-11-08", fin: "2026-11-08", quien: "ambas" }),
        ev({ id: "d", titulo: "Dentista", inicio: "2026-11-08", fin: "2026-11-08", quien: "p2", horaInicio: "10:00", horaFin: null })],
      suscripciones: [sub("e", "p1"), sub("m", "p2")],
      ahora: new Date("2026-11-07T12:00:00Z"), hoy: "2026-11-07", dias: 2,
    });
    expect(plan.map((p) => [p.dispositivo, p.aviso.b])).toEqual([
      ["e", "Hoy: 📅 Cena (21:00)"],
      ["m", "Hoy: 📅 Dentista (10:00) y Cena (21:00)"],
    ]);
  });

  it("recordatorios: víspera y un par de horas antes, solo a quien le toca", () => {
    const plan = planificar({
      tareas: [], pareja: PAREJA_INICIAL,
      eventos: [
        ev({ id: "v", titulo: "Médico", quien: "p2", inicio: "2026-11-10", fin: "2026-11-10", horaInicio: "12:00", horaFin: null, aviso: "vispera" }),
        ev({ id: "a", titulo: "Cine", quien: "ambas", inicio: "2026-11-10", fin: "2026-11-10", horaInicio: "19:30", horaFin: null, aviso: "antes" }),
      ],
      suscripciones: [sub("e", "p1", { manana: false }), sub("m", "p2", { manana: false })],
      ahora: new Date("2026-11-07T12:00:00Z"), hoy: "2026-11-07", dias: 7,
    });
    expect(plan.map((p) => [p.cuando, p.dispositivo, p.aviso.t])).toEqual([
      ["2026-11-09T19:00:00.000Z", "m", "📅 Mañana: Médico"],
      ["2026-11-10T16:30:00.000Z", "e", "📅 Cine a las 19:30"],
      ["2026-11-10T16:30:00.000Z", "m", "📅 Cine a las 19:30"],
    ]);
  });
});
