import { horarioDelDia, type Horario } from "../src/dominio/calendario";
import { AJUSTES_FESTIVOS, eventosFestivos, listaFestivos, nombreBonito, ultimoAnioFestivos } from "../src/dominio/festivos";
import { leerZona, type Zona } from "../src/dominio/zona";
import { huecos, ocupado } from "../src/dominio/recomendar";
import { leerRespuesta } from "../src/servicios/festivos";

const trabajo = (p: "p1" | "p2"): Horario => ({ id: p, bloques: [{ dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "15:00", etiqueta: "Trabajo" }] });

/** Zona inventada (la de verdad está en el repositorio privado, no en el código). */
const ZONA: Zona = leerZona({
  version: 1,
  ciudad: { nombre: "Villaprueba", lat: 40.5, lon: -4 },
  provincia: "Provincia de prueba",
  municipioIne: 99999,
  comunidad: "la comunidad de prueba",
  festivos: {
    "2026": [["01-01", "Año Nuevo"], ["11-02", "Todos los Santos (trasladado al lunes)"], ["12-07", "Día de la Constitución (trasladado al lunes)"], ["12-08", "Inmaculada Concepción"]],
    "2027": [["01-01", "Año Nuevo"], ["08-16", "Asunción de la Virgen (trasladada al lunes)"]],
  },
  localesReserva: [{ fecha: "2026-05-13", nombre: "Fiesta del patrón" }, { fecha: "2026-09-08", nombre: "Fiesta de la patrona" }],
  ideas: [], fechasEspeciales: [], sitios: [],
})!;

describe("festivos de la zona", () => {
  it("lee zona.json y descarta lo que no tiene forma", () => {
    expect(ZONA.ciudad.nombre).toBe("Villaprueba");
    expect(leerZona({ ciudad: { nombre: "x", lat: 200, lon: 0 } })).toBeNull();
    expect(leerZona(null)).toBeNull();
    const z = leerZona({ ciudad: { nombre: "x", lat: 1, lon: 2 }, festivos: { "2026": [["01-01", "A"], ["mal", "B"]], nope: [] }, sitios: [{ nombre: "s" }] })!;
    expect(z.festivos).toEqual({ "2026": [["01-01", "A"]] });
    expect(z.sitios).toEqual([]);
    expect(ultimoAnioFestivos(ZONA)).toBe(2027);
    expect(ultimoAnioFestivos(null)).toBeNull();
  });

  it("junta los locales (descargados o de reserva) sin repetir días", () => {
    const sinRed = listaFestivos(ZONA, []);
    expect(sinRed.find((f) => f.fecha === "2026-05-13")?.nombre).toBe("Fiesta del Patrón");
    const descargados = listaFestivos(ZONA, [
      { fecha: "2026-05-13", nombre: "SAN PATRÓN" }, { fecha: "2026-09-08", nombre: "NUESTRA SEÑORA DE LA PRUEBA" },
      { fecha: "2026-12-08", nombre: "INMACULADA CONCEPCIÓN" },
    ]);
    expect(descargados.find((f) => f.fecha === "2026-09-08")?.nombre).toBe("Nuestra Señora de la Prueba");
    // Si una local coincide con una de la comunidad, sale un solo día.
    expect(descargados.filter((f) => f.fecha === "2026-12-08")).toEqual([{ fecha: "2026-12-08", nombre: "Inmaculada Concepción" }]);
    // Con los descargados de 2026, la lista de reserva de 2026 no se duplica.
    expect(descargados.filter((f) => f.fecha.startsWith("2026-09"))).toHaveLength(1);
    expect(nombreBonito("DIA DE LA ASUNCIÓN DE LA VIRGEN")).toBe("Dia de la Asunción de la Virgen");
    // Sin zona no hay festivos.
    expect(listaFestivos(null, [])).toEqual([]);
  });

  it("lee la respuesta de los datos abiertos e ignora lo raro", () => {
    expect(leerRespuesta({ results: [
      { fecha_fiesta: "2027-05-13", nombre_fiesta: "SAN PATRÓN" }, { fecha_fiesta: "mañana", nombre_fiesta: "X" }, { nombre_fiesta: "Y" },
    ] })).toEqual([{ fecha: "2027-05-13", nombre: "SAN PATRÓN" }]);
    expect(leerRespuesta({ error: "x" })).toEqual([]);
  });

  it("quien los libra no tiene horario ese día; quien no, sí", () => {
    const evs = eventosFestivos({ ...AJUSTES_FESTIVOS, libran: { p1: true, p2: false } }, ZONA, []);
    expect(evs[0]!.lugar).toBe("Villaprueba");
    // Lunes 2 de noviembre de 2026 (trasladado).
    expect(horarioDelDia(trabajo("p1"), "2026-11-02", "p1", evs)).toEqual([]);
    expect(horarioDelDia(trabajo("p2"), "2026-11-02", "p2", evs)).toEqual([{ desde: 480, hasta: 900, etiqueta: "Trabajo" }]);
    // El festivo en sí no ocupa a nadie.
    expect(ocupado("2026-11-02", "p2", evs, undefined)).toEqual([]);
    // Si no se quieren ver, o no hay zona, no hay festivos.
    expect(eventosFestivos({ ...AJUSTES_FESTIVOS, mostrar: false }, ZONA, [])).toEqual([]);
    expect(eventosFestivos(AJUSTES_FESTIVOS, null, [])).toEqual([]);
  });

  it("los puentes salen como hueco de viaje", () => {
    const evs = eventosFestivos(AJUSTES_FESTIVOS, ZONA, []);
    // Sábado 5 a martes 8 de diciembre de 2026: lunes 7 y martes 8 festivos.
    const hs = huecos("2026-12-05", 4, evs, { p1: trabajo("p1"), p2: trabajo("p2") });
    expect(hs.some((x) => x.tipo === "viaje" && x.dia === "2026-12-05" && x.hastaDia === "2026-12-08")).toBe(true);
  });
});
