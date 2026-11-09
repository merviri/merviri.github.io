import type { Album, Foto } from "../src/dominio/album";
import { conCoordenadas, puntosDelMapa } from "../src/dominio/mapa";
import { PLAN_VACIO, type Plan } from "../src/dominio/planes";

const plan = (p: Partial<Plan>): Plan => ({ id: "p", titulo: "Plan", ...PLAN_VACIO, ...p });
const album = (a: Partial<Album>): Album => ({ id: "a", nombre: "Álbum", emoji: "📷", plan: null, ...a });
const foto = (f: Partial<Foto>): Foto => ({
  id: "f", repo: "fotos-1", base: "x", fecha: "2026-04-15", hora: null, nombre: "x.jpg", tipo: "image/jpeg", ancho: 1, alto: 1, bytes: 1,
  sinVista: false, albumes: [], favorita: false, papelera: null, ...f,
});
const lisboa = { nombre: "Lisboa", lat: 38.7223, lon: -9.1393 };

describe("mapa de sitios", () => {
  it("pone los álbumes con lugar y los planes con sitio, juntando lo que está en el mismo sitio", () => {
    const ps = puntosDelMapa({
      albumes: [album({ id: "lis", nombre: "Lisboa 2026", lugar: lisboa }), album({ id: "sin", nombre: "Sin lugar" })],
      planes: [
        plan({ id: "fado", titulo: "Cena con fado", estado: "hecho", hechoEn: "2026-04-16", lugar: { nombre: "Lisboa", lat: 38.7224, lon: -9.1392 } }),
        plan({ id: "idea", titulo: "Solo idea", estado: "idea", lugar: { nombre: "Oporto", lat: 41.15, lon: -8.61 } }),
        plan({ id: "seg", titulo: "Segovia", estado: "planificado", fecha: "2026-12-05", lugar: { nombre: "Segovia", lat: 40.95, lon: -4.12 } }),
        plan({ id: "nada", titulo: "Sin coordenadas", estado: "hecho", lugar: { nombre: "Algún sitio", lat: null, lon: null } }),
      ],
      fotos: [foto({ id: "1", albumes: ["lis"], fecha: "2026-04-15" }), foto({ id: "2", albumes: ["lis"], fecha: "2026-04-17" }), foto({ id: "3", albumes: ["lis"], papelera: "x" })],
    });
    expect(ps.map((p) => [p.nombre, p.cosas.map((c) => `${c.tipo}:${c.id}:${c.fotos}${c.futuro ? ":futuro" : ""}`)])).toEqual([
      ["Lisboa", ["plan:fado:0", "album:lis:2"]],
      ["Segovia", ["plan:seg:0:futuro"]],
    ]);
    expect(ps[0]!.cosas.find((c) => c.id === "lis")?.href).toBe("#album/lis");
  });

  it("el álbum de un plan usa el sitio del plan y el plan no se repite", () => {
    const ps = puntosDelMapa({
      albumes: [album({ id: "plan-x", nombre: "Peñafiel", plan: "x", lugar: null })],
      planes: [plan({ id: "x", titulo: "Peñafiel", estado: "hecho", hechoEn: "2026-10-03", lugar: { nombre: "Peñafiel", lat: 41.6, lon: -4.12 } })],
      fotos: [],
    });
    expect(ps).toHaveLength(1);
    expect(ps[0]!.cosas).toEqual([expect.objectContaining({ tipo: "album", id: "plan-x", desde: "2026-10-03" })]);
  });

  it("solo valen coordenadas de verdad", () => {
    expect(conCoordenadas(lisboa)).toBe(true);
    expect(conCoordenadas({ nombre: "x", lat: null, lon: 1 })).toBe(false);
    expect(conCoordenadas({ nombre: "x", lat: 120, lon: 1 })).toBe(false);
    expect(conCoordenadas(null)).toBe(false);
  });
});
