import { planificar, type Suscripcion } from "../src/dominio/avisos";
import {
  deseoVisible, estadoPregunta, estadoVotacion, fechasCapsula, idRespuesta, leerOpciones, limpiarCampos, ordenarDeseos,
  preguntaDe, problemaCapsula, problemaVotacion, proximoCumple, racha, resumenAnio, type Capsula, type Deseo, type Respuesta, type Votacion, type Voto,
} from "../src/dominio/juntas";
import { PAREJA_INICIAL } from "../src/dominio/pareja";
import { PREGUNTAS } from "../src/dominio/preguntas";

const resp = (fecha: string, persona: "p1" | "p2", texto = "Sí"): Respuesta => ({ id: idRespuesta(fecha, persona), fecha, persona, texto });

describe("pregunta del día", () => {
  it("es la misma para las dos, cambia cada día y da la vuelta", () => {
    expect(preguntaDe("2026-01-01")).toEqual({ indice: 0, texto: PREGUNTAS[0] });
    expect(preguntaDe("2026-01-02").indice).toBe(1);
    expect(preguntaDe("2025-12-31").indice).toBe(PREGUNTAS.length - 1);
    const vuelta = new Date(Date.UTC(2026, 0, 1 + PREGUNTAS.length)).toISOString().slice(0, 10);
    expect(preguntaDe(vuelta).indice).toBe(0);
    expect(new Set(PREGUNTAS).size).toBe(PREGUNTAS.length);
  });

  it("la respuesta de la otra solo se ve cuando has contestado tú", () => {
    const rs = [resp("2026-11-07", "p2", "La playa")];
    expect(estadoPregunta(rs, "2026-11-07", "p1")).toEqual({ mia: null, suya: null, otraHaContestado: true });
    const ambas = [...rs, resp("2026-11-07", "p1", "El concierto")];
    const e = estadoPregunta(ambas, "2026-11-07", "p1");
    expect(e.mia?.texto).toBe("El concierto");
    expect(e.suya?.texto).toBe("La playa");
    // Una respuesta vacía no cuenta.
    expect(estadoPregunta([resp("2026-11-07", "p1", "  ")], "2026-11-07", "p2").otraHaContestado).toBe(false);
  });

  it("cuenta la racha de días contestados por las dos", () => {
    const rs = ["2026-11-04", "2026-11-05", "2026-11-06"].flatMap((f) => [resp(f, "p1"), resp(f, "p2")]);
    expect(racha(rs, "2026-11-07")).toBe(3); // hoy aún no: cuenta hasta ayer
    expect(racha([...rs, resp("2026-11-07", "p1")], "2026-11-07")).toBe(3);
    expect(racha([...rs, resp("2026-11-07", "p1"), resp("2026-11-07", "p2")], "2026-11-07")).toBe(4);
    expect(racha(rs.filter((r) => r.fecha !== "2026-11-05"), "2026-11-07")).toBe(1);
    expect(racha(rs, "2026-11-09")).toBe(0);
  });
});

describe("decidir juntas", () => {
  const v: Votacion = { id: "v", pregunta: "¿Dónde cenamos?", opciones: ["Japonés", "Pizza", "Casa"], desempate: null, cerrada: false };
  const voto = (persona: "p1" | "p2", opcion: number): Voto => ({ id: `v:${persona}`, votacion: "v", persona, opcion });

  it("el voto de la otra es secreto hasta que votas tú", () => {
    expect(estadoVotacion(v, [voto("p2", 1)], "p1")).toMatchObject({ mio: null, suyo: null, otraHaVotado: true, completa: false, ganadora: null });
    expect(estadoVotacion(v, [voto("p1", 0)], "p1")).toMatchObject({ mio: 0, otraHaVotado: false, completa: false });
  });

  it("si coincidís gana esa; si no, decide el azar (si lo habéis pedido)", () => {
    expect(estadoVotacion(v, [voto("p1", 1), voto("p2", 1)], "p2")).toMatchObject({ completa: true, coinciden: true, ganadora: 1, suyo: 1 });
    expect(estadoVotacion(v, [voto("p1", 0), voto("p2", 2)], "p1")).toMatchObject({ completa: true, coinciden: false, ganadora: null, suyo: 2 });
    expect(estadoVotacion({ ...v, desempate: 2 }, [voto("p1", 0), voto("p2", 2)], "p1").ganadora).toBe(2);
    // Un desempate que no es ninguna de las dos opciones votadas no vale.
    expect(estadoVotacion({ ...v, desempate: 1 }, [voto("p1", 0), voto("p2", 2)], "p1").ganadora).toBeNull();
    // Un voto fuera de rango no cuenta.
    expect(estadoVotacion(v, [voto("p1", 7)], "p1").mio).toBeNull();
  });

  it("lee las opciones una por línea", () => {
    expect(leerOpciones("- Japonés\n2) Pizza\n\n• japonés\n  Casa  ")).toEqual(["Japonés", "Pizza", "Casa"]);
    expect(problemaVotacion("¿Qué peli?", ["Una"])).toMatch(/dos opciones/);
    expect(problemaVotacion("", ["a", "b"])).toMatch(/decidir/);
    expect(problemaVotacion("¿Qué?", ["a", "b", "c", "d", "e", "f", "g"])).toMatch(/6/);
    expect(problemaVotacion("¿Qué?", ["a", "b"])).toBeNull();
  });
});

describe("cápsulas del tiempo", () => {
  const c: Capsula = { id: "c", para: "p2", abrir: "2027-11-07", titulo: "Para dentro de un año", mensaje: "Hola" };
  it("solo se pueden programar para el futuro", () => {
    expect(problemaCapsula(c, "2026-11-07")).toBeNull();
    expect(problemaCapsula({ ...c, abrir: "2026-11-07" }, "2026-11-07")).toMatch(/mañana/);
    expect(problemaCapsula({ ...c, mensaje: " " }, "2026-11-07")).toMatch(/mensaje/);
  });

  it("propone fechas (incluido el próximo aniversario)", () => {
    const f = fechasCapsula("2026-11-07", "2023-11-10");
    expect(f.map((x) => x.fecha)).toEqual(["2026-12-07", "2027-11-07", "2026-11-10", "2031-11-07", "2026-12-31"]);
    expect(fechasCapsula("2026-12-31", null).find((x) => x.texto === "Nochevieja")?.fecha).toBe("2027-12-31");
  });
});

describe("fichas y deseos", () => {
  it("limpia los campos de la ficha", () => {
    expect(limpiarCampos([
      { etiqueta: "Talla de zapato", valor: "38" }, { etiqueta: " ", valor: "x" }, { etiqueta: "Café", valor: "" },
      { etiqueta: "talla de zapato", valor: "39" },
    ])).toEqual([{ etiqueta: "talla de zapato", valor: "39" }]);
  });

  it("el próximo cumpleaños (y los 29 de febrero)", () => {
    expect(proximoCumple({ cumple: "1995-11-20" }, "2026-11-07")).toEqual({ fecha: "2026-11-20", faltan: 13, anios: 31 });
    expect(proximoCumple({ cumple: "1995-03-02" }, "2026-11-07")?.fecha).toBe("2027-03-02");
    expect(proximoCumple({ cumple: "1996-11-07" }, "2026-11-07")?.faltan).toBe(0);
    expect(proximoCumple({ cumple: "1996-02-29" }, "2026-11-07")?.fecha).toBe("2027-02-28");
    expect(proximoCumple({ cumple: null }, "2026-11-07")).toBeNull();
  });

  it("las ideas de regalo de la otra no las ve la dueña", () => {
    expect(deseoVisible({ de: "p2", por: "p2" }, "p2")).toBe(true);
    expect(deseoVisible({ de: "p2", por: "p1" }, "p2")).toBe(false);
    expect(deseoVisible({ de: "p2", por: "p1" }, "p1")).toBe(true);
    const d = (x: Partial<Deseo> & { actualizado: string }): Deseo & { actualizado: string } =>
      ({ id: x.titulo ?? "d", de: "p1", titulo: "d", enlace: null, precio: null, mucho: false, conseguido: false, ...x });
    expect(ordenarDeseos([
      d({ titulo: "viejo", actualizado: "2026-01-01" }), d({ titulo: "conseguido", mucho: true, conseguido: true, actualizado: "2026-11-01" }),
      d({ titulo: "mucho", mucho: true, actualizado: "2025-01-01" }), d({ titulo: "nuevo", actualizado: "2026-10-01" }),
    ]).map((x) => x.titulo)).toEqual(["mucho", "nuevo", "viejo", "conseguido"]);
  });
});

describe("nuestro año", () => {
  it("resume lo vivido", () => {
    const r = resumenAnio(2026, {
      planes: [
        { titulo: "Segovia", estado: "hecho", hechoEn: "2026-05-01" }, { titulo: "Concierto", estado: "hecho", hechoEn: "2026-02-01" },
        { titulo: "Viejo", estado: "hecho", hechoEn: "2025-05-01" }, { titulo: "Pendiente", estado: "idea", hechoEn: null },
      ],
      fotos: [
        { fecha: "2026-05-01", papelera: null }, { fecha: "2026-05-02", papelera: null }, { fecha: "2026-02-01", papelera: null },
        { fecha: "2026-05-03", papelera: "2026-06-01T00:00:00Z" }, { fecha: "2025-05-01", papelera: null },
      ],
      respuestas: [resp("2026-03-01", "p1"), resp("2026-03-01", "p2"), resp("2026-03-02", "p1")],
      dibujos: [{ actualizado: "2026-04-01T10:00:00Z" }],
      votaciones: [{ id: "a", actualizado: "2026-01-01T00:00:00Z" }, { id: "b", actualizado: "2026-01-01T00:00:00Z" }],
      votos: [{ id: "a:p1", votacion: "a", persona: "p1", opcion: 0 }, { id: "a:p2", votacion: "a", persona: "p2", opcion: 0 }, { id: "b:p1", votacion: "b", persona: "p1", opcion: 0 }],
      capsulas: [],
    });
    expect(r).toEqual({ anio: 2026, planes: ["Concierto", "Segovia"], fotos: 3, mesFotos: "2026-05", preguntas: 1, dibujos: 1, decisiones: 1, capsulas: 0 });
  });
});

describe("avisos de pareja", () => {
  const sub = (id: string, persona: "p1" | "p2", tipos = {}): Suscripcion =>
    ({ id, persona, nombre: id, endpoint: "https://fcm.googleapis.com/x", p256dh: "", auth: "", prefs: { tipos, silencioDesde: null, silencioHasta: null } });

  it("avisa de las cápsulas que se abren, a quien van dirigidas", () => {
    const plan = planificar({
      tareas: [], pareja: PAREJA_INICIAL, suscripciones: [sub("e", "p1"), sub("m", "p2")],
      capsulas: [
        { id: "a", para: "p2", abrir: "2026-11-09", titulo: "Para ti", mensaje: "secreto" },
        { id: "b", para: "ambas", abrir: "2026-11-10", titulo: "Juntas", mensaje: "x" },
        { id: "c", para: "p1", abrir: "2027-01-01", titulo: "Lejos", mensaje: "x" },
      ],
      ahora: new Date("2026-11-07T10:00:00Z"), hoy: "2026-11-07", dias: 7,
    });
    expect(plan.map((p) => [p.dispositivo, p.aviso.b, p.cuando.slice(0, 10)])).toEqual([
      ["m", "«Para ti»", "2026-11-09"], ["e", "«Juntas»", "2026-11-10"], ["m", "«Juntas»", "2026-11-10"],
    ]);
    // El mensaje nunca va en el aviso.
    expect(JSON.stringify(plan)).not.toContain("secreto");
  });

  it("felicita el cumpleaños y avisa a la otra una semana antes", () => {
    const plan = planificar({
      tareas: [], pareja: PAREJA_INICIAL, suscripciones: [sub("e", "p1"), sub("m", "p2")],
      fichas: [{ id: "p2", cumple: "1995-11-08", campos: [] }, { id: "p1", cumple: "1994-11-14", campos: [] }],
      ahora: new Date("2026-11-07T06:00:00Z"), hoy: "2026-11-07", dias: 3,
    });
    expect(plan.map((p) => [p.dispositivo, p.aviso.t, p.cuando.slice(0, 10)])).toEqual([
      ["e", "🎂 Hoy es el cumple de María", "2026-11-08"],
      ["m", "🎂 ¡Feliz cumpleaños, María!", "2026-11-08"],
      ["m", "🎁 En una semana es el cumple de Elvira", "2026-11-07"],
    ].sort((a, b) => a[2]!.localeCompare(b[2]!) || a[0]!.localeCompare(b[0]!)));
  });
});
