import { codificarPuntos, decodificarPuntos, sinVer, type Dibujo, type Reaccion } from "../src/dominio/dibujos";
import { ordenarElementos, separarCantidad, type Elemento } from "../src/dominio/listas";
import { notaVacia, ordenarNotas, resumen, type Nota } from "../src/dominio/notas";
import {
  agrupar,
  aQuien,
  completar,
  esMia,
  hechasRecientes,
  problemaTarea,
  recordatoriosPara,
  siguienteFecha,
  sumarPeriodo,
  textoRepeticion,
  type Tarea,
} from "../src/dominio/tareas";
import { purgarBorrados } from "../src/sync/motor";

const tarea = (t: Partial<Tarea>): Tarea => ({
  id: "t", titulo: "Basura", notas: null, responsable: "p1", turno: null, fecha: null, repeticion: null,
  hecha: false, hechaPor: null, hechaEn: null, recordatorio: null, ...t,
});

describe("tareas", () => {
  it("suma periodos (los meses se ajustan al último día)", () => {
    expect(sumarPeriodo("2026-11-07", { cada: 1, unidad: "dia" })).toBe("2026-11-08");
    expect(sumarPeriodo("2026-11-07", { cada: 2, unidad: "semana" })).toBe("2026-11-21");
    expect(sumarPeriodo("2026-01-31", { cada: 1, unidad: "mes" })).toBe("2026-02-28");
    expect(sumarPeriodo("2026-11-30", { cada: 3, unidad: "mes" })).toBe("2027-02-28");
  });

  it("la siguiente vez nunca queda en el pasado", () => {
    const semanal = { cada: 1, unidad: "semana" as const };
    expect(siguienteFecha("2026-11-07", semanal, "2026-11-07")).toBe("2026-11-14");
    expect(siguienteFecha("2026-10-01", semanal, "2026-11-07")).toBe("2026-11-12");
    expect(siguienteFecha("2026-11-20", semanal, "2026-11-07")).toBe("2026-11-27"); // hecha antes de tiempo
    expect(siguienteFecha(null, semanal, "2026-11-07")).toBe("2026-11-14");
  });

  it("completar una que se repite la mueve a la siguiente vez y, por turnos, le toca a la otra", () => {
    const t = tarea({ responsable: "turnos", turno: "p1", fecha: "2026-11-07", repeticion: { cada: 1, unidad: "semana" },
      recordatorio: { por: "p2", para: "p1", en: "x", visto: null } });
    const c = completar(t, "p1", "2026-11-07", "2026-11-07T10:00:00Z");
    expect(c).toMatchObject({ hecha: false, fecha: "2026-11-14", turno: "p2", hechaPor: "p1", recordatorio: null });
    expect(aQuien(c)).toBe("p2");
    // Si la hace la otra aunque no le tocara, la siguiente vuelve a la primera.
    expect(completar(c, "p1", "2026-11-14", "x").turno).toBe("p2");
    expect(completar(c, "p2", "2026-11-14", "x").turno).toBe("p1");
  });

  it("completar una que no se repite la marca como hecha", () => {
    const c = completar(tarea({ fecha: "2026-11-07" }), "p2", "2026-11-07", "2026-11-07T10:00:00Z");
    expect(c).toMatchObject({ hecha: true, hechaPor: "p2", fecha: "2026-11-07" });
  });

  it("agrupa por secciones y filtra lo mío", () => {
    const ts = [
      tarea({ id: "a", fecha: "2026-11-01" }),
      tarea({ id: "b", fecha: "2026-11-07", responsable: "p2" }),
      tarea({ id: "c", fecha: "2026-11-10", responsable: "ambas" }),
      tarea({ id: "d", fecha: "2026-12-01" }),
      tarea({ id: "e" }),
      tarea({ id: "f", hecha: true }),
    ];
    const g = agrupar(ts, "2026-11-07");
    expect(g.atrasadas.map((t) => t.id)).toEqual(["a"]);
    expect(g.hoy.map((t) => t.id)).toEqual(["b"]);
    expect(g.semana.map((t) => t.id)).toEqual(["c"]);
    expect(g.despues.map((t) => t.id)).toEqual(["d"]);
    expect(g.sinFecha.map((t) => t.id)).toEqual(["e"]);
    expect(ts.filter((t) => esMia(t, "p1")).map((t) => t.id)).toEqual(["a", "c", "d", "e", "f"]);
  });

  it("hechas recientes y recordatorios", () => {
    const ahora = new Date("2026-11-07T12:00:00Z");
    const ts = [
      tarea({ id: "vieja", hecha: true, hechaEn: "2026-10-01T00:00:00Z" }),
      tarea({ id: "nueva", hecha: true, hechaEn: "2026-11-06T00:00:00Z" }),
      tarea({ id: "r", recordatorio: { por: "p2", para: "p1", en: "x", visto: null } }),
      tarea({ id: "r2", recordatorio: { por: "p2", para: "p1", en: "x", visto: "y" } }),
    ];
    expect(hechasRecientes(ts, ahora).map((t) => t.id)).toEqual(["nueva"]);
    expect(recordatoriosPara(ts, "p1").map((t) => t.id)).toEqual(["r"]);
    expect(recordatoriosPara(ts, "p2")).toEqual([]);
  });

  it("textos y validación", () => {
    expect(textoRepeticion(null)).toBe("No se repite");
    expect(textoRepeticion({ cada: 1, unidad: "dia" })).toBe("Cada día");
    expect(textoRepeticion({ cada: 2, unidad: "semana" })).toBe("Cada 2 semanas");
    expect(problemaTarea(tarea({ titulo: " " }))).toMatch(/nombre/);
    expect(problemaTarea(tarea({ responsable: "turnos", turno: null }))).toMatch(/primera vez/);
    expect(problemaTarea(tarea({}))).toBeNull();
  });
});

describe("listas", () => {
  const el = (e: Partial<Elemento>): Elemento => ({
    id: "x", texto: "x", cantidad: null, nota: null, hecho: false, hechoPor: null, hechoEn: null, orden: 0, ...e,
  });

  it("pendientes por orden, hechos el último primero", () => {
    const r = ordenarElementos([
      el({ id: "b", orden: 2 }), el({ id: "a", orden: 1 }),
      el({ id: "h1", hecho: true, hechoEn: "2026-11-01" }), el({ id: "h2", hecho: true, hechoEn: "2026-11-05" }),
    ]);
    expect(r.pendientes.map((e) => e.id)).toEqual(["a", "b"]);
    expect(r.hechos.map((e) => e.id)).toEqual(["h2", "h1"]);
  });

  it("separa la cantidad", () => {
    expect(separarCantidad("2 kg de tomates")).toEqual({ cantidad: "2 kg", texto: "tomates" });
    expect(separarCantidad("6 huevos")).toEqual({ cantidad: "6", texto: "huevos" });
    expect(separarCantidad("leche")).toEqual({ cantidad: null, texto: "leche" });
    expect(separarCantidad("  pan   de molde ")).toEqual({ cantidad: null, texto: "pan de molde" });
  });
});

describe("notas", () => {
  it("fijadas primero y luego la última tocada", () => {
    const n = (id: string, fijada: boolean, actualizado: string): Nota & { actualizado: string } =>
      ({ id, titulo: id, texto: "", color: "blanco", fijada, actualizado });
    expect(ordenarNotas([n("a", false, "2026-11-01"), n("b", true, "2026-10-01"), n("c", false, "2026-11-05")]).map((x) => x.id))
      .toEqual(["b", "c", "a"]);
    expect(notaVacia({ titulo: " ", texto: "\n" })).toBe(true);
    expect(resumen("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });
});

describe("dibujos", () => {
  it("los puntos van y vuelven (redondeados y dentro del lienzo)", () => {
    const p = codificarPuntos([[10.4, 20.6], [15, 25], [5000, -3]]);
    expect(p).toEqual([10, 21, 5, 4, 885, -25]);
    expect(decodificarPuntos(p)).toEqual([[10, 21], [15, 25], [900, 0]]);
  });

  it("sin ver: solo los que me mandó la otra y no he visto", () => {
    const d = (id: string, por: string, para: Dibujo["para"], actualizado: string) =>
      ({ id, por, para, fondo: "#fff", respondeA: null, actualizado });
    const dibujos = [d("a", "p2", "p1", "1"), d("b", "p2", "ambas", "3"), d("c", "p1", "p2", "4"), d("e", "p2", "p1", "2")];
    const reacciones: Reaccion[] = [{ id: "e:p1", dibujo: "e", persona: "p1", visto: "x", megusta: false }];
    expect(sinVer(dibujos, reacciones, "p1").map((x) => x.id)).toEqual(["b", "a"]);
    expect(sinVer(dibujos, reacciones, "p2").map((x) => x.id)).toEqual(["c"]);
  });
});

describe("limpieza de borrados", () => {
  it("quita las marcas de borrado de hace más de 90 días", () => {
    const r = purgarBorrados({
      viejo: { id: "viejo", actualizado: "2026-01-01T00:00:00Z", por: "p1", borrado: true },
      reciente: { id: "reciente", actualizado: "2026-11-01T00:00:00Z", por: "p1", borrado: true },
      vivo: { id: "vivo", actualizado: "2025-01-01T00:00:00Z", por: "p1" },
    }, "2026-11-07T00:00:00Z");
    expect(Object.keys(r).sort()).toEqual(["reciente", "vivo"]);
  });
});
