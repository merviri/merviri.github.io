import { horarioDelDia, type Horario } from "../src/dominio/calendario";
import { AJUSTES_FESTIVOS, eventosFestivos, FESTIVOS_CYL, listaFestivos, nombreBonito } from "../src/dominio/festivos";
import { huecos, ocupado } from "../src/dominio/recomendar";
import { leerRespuesta } from "../src/servicios/festivos";

const trabajo = (p: "p1" | "p2"): Horario => ({ id: p, bloques: [{ dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "15:00", etiqueta: "Trabajo" }] });

describe("festivos de Valladolid", () => {
  it("lleva los del BOCyL con los traslados a lunes", () => {
    const f2026 = FESTIVOS_CYL[2026]!.map(([md]) => md);
    const f2027 = FESTIVOS_CYL[2027]!.map(([md]) => md);
    expect(f2026).toHaveLength(12);
    expect(f2027).toHaveLength(12);
    // 2026: Todos los Santos y la Constitución caen en domingo y pasan al lunes.
    expect(f2026).toContain("11-02");
    expect(f2026).toContain("12-07");
    expect(f2026).not.toContain("11-01");
    // 2027: la Asunción pasa al lunes 16.
    expect(f2027).toContain("08-16");
    expect(f2027).not.toContain("08-15");
  });

  it("junta los locales (descargados o de reserva) sin repetir días", () => {
    const sinRed = listaFestivos([]);
    expect(sinRed.find((f) => f.fecha === "2026-05-13")?.nombre).toBe("San Pedro Regalado");
    const descargados = listaFestivos([
      { fecha: "2026-05-13", nombre: "SAN PEDRO REGALADO" }, { fecha: "2026-09-08", nombre: "NUESTRA SEÑORA DE SAN LORENZO" },
      { fecha: "2026-12-08", nombre: "INMACULADA CONCEPCIÓN" },
    ]);
    expect(descargados.find((f) => f.fecha === "2026-09-08")?.nombre).toBe("Nuestra Señora de San Lorenzo");
    // Si una local coincide con una de la Comunidad, sale un solo día.
    expect(descargados.filter((f) => f.fecha === "2026-12-08")).toEqual([{ fecha: "2026-12-08", nombre: "Inmaculada Concepción" }]);
    // Con los descargados de 2026, la lista de reserva de 2026 no se duplica.
    expect(descargados.filter((f) => f.fecha.startsWith("2026-09"))).toHaveLength(1);
    expect(nombreBonito("DIA DE LA ASUNCIÓN DE LA VIRGEN")).toBe("Dia de la Asunción de la Virgen");
  });

  it("lee la respuesta de los datos abiertos e ignora lo raro", () => {
    expect(leerRespuesta({ results: [
      { fecha_fiesta: "2027-05-13", nombre_fiesta: "SAN PEDRO REGALADO" }, { fecha_fiesta: "mañana", nombre_fiesta: "X" }, { nombre_fiesta: "Y" },
    ] })).toEqual([{ fecha: "2027-05-13", nombre: "SAN PEDRO REGALADO" }]);
    expect(leerRespuesta({ error: "x" })).toEqual([]);
  });

  it("quien los libra no tiene horario ese día; quien no, sí", () => {
    const evs = eventosFestivos({ ...AJUSTES_FESTIVOS, libran: { p1: true, p2: false } }, []);
    // Lunes 2 de noviembre de 2026 (Todos los Santos, trasladado).
    expect(horarioDelDia(trabajo("p1"), "2026-11-02", "p1", evs)).toEqual([]);
    expect(horarioDelDia(trabajo("p2"), "2026-11-02", "p2", evs)).toEqual([{ desde: 480, hasta: 900, etiqueta: "Trabajo" }]);
    // El festivo en sí no ocupa a nadie.
    expect(ocupado("2026-11-02", "p2", evs, undefined)).toEqual([]);
    // Si no se quieren ver, no hay festivos.
    expect(eventosFestivos({ ...AJUSTES_FESTIVOS, mostrar: false }, [])).toEqual([]);
  });

  it("los puentes salen como hueco de viaje", () => {
    const evs = eventosFestivos(AJUSTES_FESTIVOS, []);
    // Sábado 5 a martes 8 de diciembre de 2026: lunes 7 y martes 8 festivos.
    const hs = huecos("2026-12-05", 4, evs, { p1: trabajo("p1"), p2: trabajo("p2") });
    expect(hs.some((x) => x.tipo === "viaje" && x.dia === "2026-12-05" && x.hastaDia === "2026-12-08")).toBe(true);
  });
});
