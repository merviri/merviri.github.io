import { PAREJA_INICIAL, type Pareja } from "../src/dominio/pareja";

/** Pareja inventada para las pruebas. */
export const PAREJA_PRUEBA: Pareja = { ...PAREJA_INICIAL, personas: { p1: { nombre: "Ana", color: "turquesa" }, p2: { nombre: "Bea", color: "rosa" } } };
