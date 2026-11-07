import {
  comoSaldar,
  dinero,
  exportarCsv,
  gastosFijosDelMes,
  idDeFijo,
  leerImporte,
  partes,
  problemaGasto,
  resumen,
  saldos,
  type Gasto,
  type GastoFijo,
} from "../src/dominio/gastos";

const g = (x: Partial<Gasto>): Gasto => ({
  id: "g", tipo: "gasto", concepto: "Cena", importe: 3000, original: null, pagadoPor: "p1",
  reparto: { modo: "iguales", entre: { p1: 1, p2: 1 } }, fecha: "2026-11-07", categoria: "restaurantes", nota: null, fijo: null, ...x,
});

describe("importes", () => {
  it("lee importes escritos de muchas formas", () => {
    expect(leerImporte("12,50")).toBe(1250);
    expect(leerImporte("12.5")).toBe(1250);
    expect(leerImporte("1.234,56")).toBe(123456);
    expect(leerImporte("1,234.56")).toBe(123456);
    expect(leerImporte("7 €")).toBe(700);
    expect(leerImporte("abc")).toBeNull();
    expect(leerImporte("1,234")).toBeNull();
    expect(dinero(123456)).toMatch(/1234,56|1\.234,56/);
  });
});

describe("repartos", () => {
  it("a partes iguales, sin perder céntimos", () => {
    expect(partes(g({ importe: 1000, reparto: { modo: "iguales", entre: { p1: 1, p2: 1, a: 1 } } }))).toEqual({ a: 334, p1: 333, p2: 333 });
    const r = partes(g({ importe: 1001 }));
    expect(r.p1! + r.p2!).toBe(1001);
  });

  it("por partes y por importes exactos", () => {
    expect(partes(g({ importe: 3000, reparto: { modo: "partes", entre: { p1: 2, p2: 1 } } }))).toEqual({ p1: 2000, p2: 1000 });
    expect(partes(g({ importe: 3000, reparto: { modo: "importes", entre: { p1: 500, p2: 2500 } } }))).toEqual({ p1: 500, p2: 2500 });
  });

  it("valida", () => {
    const ps = ["p1", "p2"];
    expect(problemaGasto(g({}), ps)).toBeNull();
    expect(problemaGasto(g({ importe: 0 }), ps)).toMatch(/mayor/);
    expect(problemaGasto(g({ reparto: { modo: "iguales", entre: {} } }), ps)).toMatch(/para quién/);
    expect(problemaGasto(g({ reparto: { modo: "importes", entre: { p1: 100, p2: 100 } } }), ps)).toMatch(/suman/);
    expect(problemaGasto(g({ tipo: "transferencia", reparto: { modo: "iguales", entre: { p1: 1 } } }), ps)).toMatch(/una persona a otra/);
  });
});

describe("saldos", () => {
  it("quién debe a quién y cómo saldar", () => {
    const gastos = [
      g({ id: "1", importe: 3000, pagadoPor: "p1" }), // cena 30 €, a medias
      g({ id: "2", importe: 1000, pagadoPor: "p2", reparto: { modo: "iguales", entre: { p1: 1, p2: 1 } } }),
    ];
    const s = saldos(gastos, ["p1", "p2"]);
    expect(s).toEqual({ p1: 1000, p2: -1000 });
    expect(comoSaldar(s)).toEqual([{ de: "p2", a: "p1", importe: 1000 }]);
    // Al marcar la transferencia como hecha, quedan en paz.
    const pagado = [...gastos, g({ id: "3", tipo: "transferencia", importe: 1000, pagadoPor: "p2", reparto: { modo: "iguales", entre: { p1: 1 } } })];
    expect(saldos(pagado, ["p1", "p2"])).toEqual({ p1: 0, p2: 0 });
  });

  it("con amigos, el mínimo de pagos", () => {
    const gastos = [g({ importe: 9000, pagadoPor: "p1", reparto: { modo: "iguales", entre: { p1: 1, p2: 1, ana: 1 } } })];
    const s = saldos(gastos, ["p1", "p2", "ana"]);
    expect(comoSaldar(s)).toEqual([{ de: "ana", a: "p1", importe: 3000 }, { de: "p2", a: "p1", importe: 3000 }]);
  });

  it("resumen por categoría sin contar transferencias", () => {
    const r = resumen([g({ importe: 1000 }), g({ importe: 500, categoria: "compra" }), g({ tipo: "transferencia", importe: 9999 })]);
    expect(r.total).toBe(1500);
    expect(r.porCategoria[0]).toEqual(["restaurantes", 1000]);
  });
});

describe("gastos fijos", () => {
  it("se apuntan una vez al mes, con un id que no se duplica", () => {
    const fijo: GastoFijo = { id: "alquiler", bote: "casa", concepto: "Alquiler", importe: 70000, pagadoPor: "p1",
      reparto: { modo: "iguales", entre: { p1: 1, p2: 1 } }, categoria: "casa", dia: 5, activo: true };
    expect(gastosFijosDelMes([fijo], "2026-11-04")).toEqual([]);
    const [gasto] = gastosFijosDelMes([fijo], "2026-11-07");
    expect(gasto).toMatchObject({ id: idDeFijo("alquiler", "2026-11"), fecha: "2026-11-05", importe: 70000, fijo: "alquiler" });
    expect(gastosFijosDelMes([{ ...fijo, activo: false }], "2026-11-07")).toEqual([]);
  });
});

describe("exportar", () => {
  it("CSV con punto y coma y comas decimales", () => {
    const t = exportarCsv([g({ concepto: 'Cena "especial"' })], (id) => (id === "p1" ? "Elvira" : "María"), "EUR");
    expect(t).toContain("2026-11-07;Gasto;\"Cena \"\"especial\"\"\";Restaurantes;30,00;Elvira;Elvira 15,00, María 15,00;");
  });
});
