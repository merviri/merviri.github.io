import { generarCodigo, normalizarCodigo } from "../src/cifrado/codigo";
import { ErrorDescifrado } from "../src/cifrado/errores";
import {
  abrirConCodigo,
  abrirConContrasena,
  cambiarContrasena,
  contrasenaCorrecta,
  crearLlavero,
  nuevoCodigoRecuperacion,
  problemaContrasena,
  validarLlavero,
} from "../src/cifrado/llavero";
import { abrirSobre, cerrarSobre } from "../src/cifrado/sobre";
import { abrirVinculo, codigoDeHash, crearVinculo, enlaceVinculo } from "../src/cifrado/vinculo";

// Pocas iteraciones en las pruebas para que vayan rápido (en la app: 600.000).
const OP = { iteraciones: 2000, iteracionesCodigo: 2000 };

describe("código de recuperación", () => {
  it("tiene 8 grupos de 4 y se normaliza perdonando errores típicos", () => {
    const c = generarCodigo();
    expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const n = normalizarCodigo(c)!;
    expect(n).toHaveLength(32);
    expect(normalizarCodigo(c.toLowerCase().replace(/-/g, " "))).toBe(n);
    expect(normalizarCodigo("o".repeat(32))).toBe("0".repeat(32));
    expect(normalizarCodigo("corto")).toBeNull();
    expect(normalizarCodigo("U".repeat(32))).toBeNull();
  });

  it("no se repite", () => {
    expect(new Set(Array.from({ length: 50 }, generarCodigo)).size).toBe(50);
  });
});

describe("llavero", () => {
  it("abre con la contraseña y con el código, y ambas dan la misma clave", async () => {
    const { llavero, codigo, abierta } = await crearLlavero("una contraseña larga", "pista", OP);
    expect(validarLlavero(llavero)).toBe(true);
    expect(llavero.pista).toBe("pista");
    const a = await abrirConContrasena(llavero, "una contraseña larga");
    const b = await abrirConCodigo(llavero, codigo.toLowerCase());
    expect(Array.from(a.bruta)).toEqual(Array.from(abierta.bruta));
    expect(Array.from(b.bruta)).toEqual(Array.from(abierta.bruta));
  });

  it("rechaza contraseña o código incorrectos", async () => {
    const { llavero } = await crearLlavero("una contraseña larga", null, OP);
    await expect(abrirConContrasena(llavero, "otra contraseña")).rejects.toBeInstanceOf(ErrorDescifrado);
    await expect(abrirConCodigo(llavero, generarCodigo())).rejects.toBeInstanceOf(ErrorDescifrado);
    expect(await contrasenaCorrecta(llavero, "una contraseña larga")).toBe(true);
    expect(await contrasenaCorrecta(llavero, "UNA contraseña larga")).toBe(false);
  });

  it("cambiar la contraseña no cambia la clave de datos", async () => {
    const { llavero, abierta, codigo } = await crearLlavero("contraseña antigua", null, OP);
    const nuevo = await cambiarContrasena(llavero, abierta, "contraseña nueva!", "nueva pista", OP);
    expect(nuevo.idClave).toBe(llavero.idClave);
    expect(nuevo.pista).toBe("nueva pista");
    await expect(abrirConContrasena(nuevo, "contraseña antigua")).rejects.toBeInstanceOf(ErrorDescifrado);
    const a = await abrirConContrasena(nuevo, "contraseña nueva!");
    expect(Array.from(a.bruta)).toEqual(Array.from(abierta.bruta));
    // El código de recuperación sigue sirviendo.
    await expect(abrirConCodigo(nuevo, codigo)).resolves.toBeTruthy();
  });

  it("un código de recuperación nuevo invalida el anterior", async () => {
    const { llavero, abierta, codigo } = await crearLlavero("contraseña larga", null, OP);
    const r = await nuevoCodigoRecuperacion(llavero, abierta, OP);
    await expect(abrirConCodigo(r.llavero, codigo)).rejects.toBeInstanceOf(ErrorDescifrado);
    await expect(abrirConCodigo(r.llavero, r.codigo)).resolves.toBeTruthy();
  });

  it("no deja intercambiar las cajas de contraseña y código", async () => {
    const { llavero } = await crearLlavero("contraseña larga", null, OP);
    const trucado = { ...llavero, contrasena: llavero.recuperacion };
    await expect(abrirConContrasena(trucado, "contraseña larga")).rejects.toBeInstanceOf(ErrorDescifrado);
  });

  it("valida la contraseña elegida", () => {
    expect(problemaContrasena("corta", null)).toMatch(/10 caracteres/);
    expect(problemaContrasena("aaaaaaaaaaaa", null)).toMatch(/repetido/);
    expect(problemaContrasena("nuestro bar favorito", "nuestro bar")).toMatch(/pista/);
    expect(problemaContrasena("una buena frase larga", "el sitio de la primera cita")).toBeNull();
  });
});

describe("sobres", () => {
  it("cifra y descifra; la ruta forma parte del cifrado", async () => {
    const { abierta } = await crearLlavero("contraseña larga", null, OP);
    const k = { clave: abierta.clave, idClave: abierta.idClave };
    const texto = await cerrarSobre(k, "datos/pareja.json", { hola: "María ✨" });
    expect(texto).not.toContain("María");
    expect(await abrirSobre(k, "datos/pareja.json", texto)).toEqual({ hola: "María ✨" });
    await expect(abrirSobre(k, "datos/otro.json", texto)).rejects.toBeInstanceOf(ErrorDescifrado);
  });

  it("detecta un sobre manipulado o de otra clave", async () => {
    const a = (await crearLlavero("contraseña larga", null, OP)).abierta;
    const b = (await crearLlavero("contraseña larga", null, OP)).abierta;
    const ka = { clave: a.clave, idClave: a.idClave };
    const kb = { clave: b.clave, idClave: b.idClave };
    const texto = await cerrarSobre(ka, "x", [1, 2, 3]);
    await expect(abrirSobre(kb, "x", texto)).rejects.toThrow(/otra clave/);
    const s = JSON.parse(texto);
    s.datos = s.datos.slice(0, -4) + (s.datos.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(abrirSobre(ka, "x", JSON.stringify(s))).rejects.toBeInstanceOf(ErrorDescifrado);
    await expect(abrirSobre(ka, "x", "no es json")).rejects.toBeInstanceOf(ErrorDescifrado);
  });
});

describe("vinculación", () => {
  const datos = { propietario: "merviri", repositorio: "datos", token: "github_pat_" + "x".repeat(82), caduca: "2027-11-07" };

  it("ida y vuelta con la contraseña correcta", async () => {
    const c = await crearVinculo(datos, "contraseña larga", 2000);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(c.length).toBeLessThan(320);
    expect(await abrirVinculo(c, "contraseña larga")).toEqual(datos);
  });

  it("falla con otra contraseña o un código roto", async () => {
    const c = await crearVinculo(datos, "contraseña larga", 2000);
    await expect(abrirVinculo(c, "otra")).rejects.toBeInstanceOf(ErrorDescifrado);
    await expect(abrirVinculo("abc", "x")).rejects.toThrow(/no es válido/);
    await expect(abrirVinculo("con espacios ?", "x")).rejects.toThrow(/no es válido/);
  });

  it("enlace y lectura del hash", async () => {
    const c = await crearVinculo(datos, "contraseña larga", 2000);
    const url = new URL(enlaceVinculo("https://merviri.github.io", c));
    expect(url.pathname).toBe("/");
    expect(codigoDeHash(url.hash)).toBe(c);
    expect(codigoDeHash("#inicio")).toBeNull();
  });
});
