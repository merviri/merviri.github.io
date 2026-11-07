import { leerIngredientes, listaDeCompra, problemaReceta, seccionDe, ultimaVez, type Receta } from "../src/dominio/cocina";

const receta = (r: Partial<Receta>): Receta => ({ id: "r", titulo: "Receta", raciones: 2, minutos: 30, ingredientes: [], pasos: "", enlace: null, etiquetas: [], ...r });

describe("cocina", () => {
  it("adivina la sección del súper (gana lo más concreto)", () => {
    expect(seccionDe("Tomates")).toBe("fruta");
    expect(seccionDe("tomate frito")).toBe("despensa");
    expect(seccionDe("Salmón")).toBe("carne");
    expect(seccionDe("sal")).toBe("despensa");
    expect(seccionDe("panceta")).toBe("carne");
    expect(seccionDe("pan de molde")).toBe("pan");
    expect(seccionDe("leche de coco")).toBe("despensa");
    expect(seccionDe("Huevos")).toBe("lacteos");
    expect(seccionDe("guisantes congelados")).toBe("congelados");
    expect(seccionDe("velas")).toBe("otros");
  });

  it("lee los ingredientes línea a línea", () => {
    expect(leerIngredientes("- 200 g de arroz\n2 huevos\n\n• sal")).toEqual([
      { nombre: "arroz", cantidad: "200 g" }, { nombre: "huevos", cantidad: "2" }, { nombre: "sal", cantidad: null },
    ]);
  });

  it("junta la compra de varias recetas, sin lo que ya está en la lista y por secciones", () => {
    const lasana = receta({ titulo: "Lasaña", ingredientes: [{ nombre: "carne picada", cantidad: "500 g" }, { nombre: "tomate", cantidad: "4" }, { nombre: "queso", cantidad: null }] });
    const ensalada = receta({ titulo: "Ensalada", ingredientes: [{ nombre: "Tomate", cantidad: "2" }, { nombre: "lechuga", cantidad: "1" }] });
    const l = listaDeCompra([{ receta: lasana, dia: "lun" }, { receta: ensalada, dia: "mar" }], ["Queso"]);
    expect(l.map((x) => x.nombre)).toEqual(["lechuga", "tomate", "carne picada"]);
    expect(l.find((x) => x.nombre === "tomate")).toMatchObject({ cantidades: ["4", "2"], para: ["Lasaña (lun)", "Ensalada (mar)"] });
  });

  it("recuerda la última vez de cada receta y valida", () => {
    const u = ultimaVez([
      { id: "a", fecha: "2026-10-01", comida: "cena", receta: "r1", texto: null, cocina: null },
      { id: "b", fecha: "2026-11-01", comida: "cena", receta: "r1", texto: null, cocina: null },
    ]);
    expect(u.get("r1")).toBe("2026-11-01");
    expect(problemaReceta(receta({ titulo: "" }))).toMatch(/nombre/);
    expect(problemaReceta(receta({ raciones: 0 }))).toMatch(/raciones/);
    expect(problemaReceta(receta({}))).toBeNull();
  });
});
