import { estadoToken, huellaToken, problemaToken } from "../src/dominio/acceso";
import { nombrePorDefecto } from "../src/dominio/dispositivos";
import { diasEntre, esFecha, haceCuanto, hoy, mismoDiaEnAnio, sumarDias } from "../src/dominio/fechas";
import { contador, PAREJA_INICIAL, problemaPareja } from "../src/dominio/pareja";

describe("fechas", () => {
  it("hoy en Madrid, también de madrugada en UTC", () => {
    expect(hoy(new Date("2026-11-07T23:30:00Z"))).toBe("2026-11-08");
    expect(hoy(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(hoy(new Date("2026-07-01T22:01:00Z"))).toBe("2026-07-02");
  });

  it("valida y cuenta días", () => {
    expect(esFecha("2024-02-29")).toBe(true);
    expect(esFecha("2026-02-29")).toBe(false);
    expect(esFecha("7/11/2026")).toBe(false);
    expect(diasEntre("2026-03-28", "2026-03-30")).toBe(2); // cambio de hora en medio
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(mismoDiaEnAnio("2024-02-29", 2027)).toBe("2027-02-28");
  });

  it("dice hace cuánto", () => {
    const ahora = new Date("2026-11-07T12:00:00Z");
    expect(haceCuanto("2026-11-07T11:59:30Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-11-07T11:30:00Z", ahora)).toBe("hace 30 min");
    expect(haceCuanto("2026-11-06T12:00:00Z", ahora)).toBe("ayer");
  });
});

describe("pareja", () => {
  it("cuenta días juntas, el próximo aniversario y el siguiente número redondo", () => {
    const c = contador("2023-11-20", "2026-11-07")!;
    expect(c.dias).toBe(1083);
    expect(c.aniversario).toEqual({ anios: 3, fecha: "2026-11-20", faltan: 13 });
    expect(c.hito).toEqual({ dias: 1100, faltan: 17 });
  });

  it("el día del aniversario faltan 0 días", () => {
    expect(contador("2020-05-01", "2026-05-01")!.aniversario).toEqual({ anios: 6, fecha: "2026-05-01", faltan: 0 });
    expect(contador("2020-05-01", "2026-05-02")!.aniversario.fecha).toBe("2027-05-01");
  });

  it("no cuenta fechas futuras", () => {
    expect(contador("2030-01-01", "2026-11-07")).toBeNull();
  });

  it("valida nombres y fecha", () => {
    expect(problemaPareja(PAREJA_INICIAL)).toBeNull();
    expect(problemaPareja({ ...PAREJA_INICIAL, juntasDesde: "ayer" })).toMatch(/fecha/);
    expect(problemaPareja({ ...PAREJA_INICIAL, personas: { ...PAREJA_INICIAL.personas, p2: { nombre: " ", color: "rosa" } } }))
      .toMatch(/nombre/);
  });
});

describe("acceso", () => {
  it("estado del token", () => {
    expect(estadoToken(null, "2026-11-07")).toEqual({ tipo: "sin-fecha" });
    expect(estadoToken("2027-11-07", "2026-11-07")).toEqual({ tipo: "vigente", quedan: 365 });
    expect(estadoToken("2026-11-20", "2026-11-07")).toEqual({ tipo: "caduca-pronto", quedan: 13 });
    expect(estadoToken("2026-11-06", "2026-11-07")).toEqual({ tipo: "caducado" });
  });

  it("huella estable y distinta por token", async () => {
    expect(await huellaToken("github_pat_a")).toBe(await huellaToken(" github_pat_a "));
    expect(await huellaToken("github_pat_a")).not.toBe(await huellaToken("github_pat_b"));
    expect(await huellaToken("github_pat_a")).toHaveLength(12);
  });

  it("orienta sobre el tipo de token", () => {
    expect(problemaToken("ghp_xxx")).toMatch(/clásico/);
    expect(problemaToken("abc")).toMatch(/github_pat_/);
    expect(problemaToken("github_pat_123")).toBeNull();
  });
});

describe("dispositivos", () => {
  it("nombre por defecto", () => {
    expect(nombrePorDefecto("María", "Mozilla/5.0 (Linux; Android 15) Mobile")).toBe("Móvil de María");
    expect(nombrePorDefecto("Elvira", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Ordenador de Elvira");
  });
});
