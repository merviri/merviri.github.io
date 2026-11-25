import type { Zona } from "../dominio/zona";

/**
 * Zona de ejemplo SOLO para el modo de desarrollo (token «falso»). La de
 * verdad está en `zona.json` del repositorio privado de datos.
 */
export const ZONA_EJEMPLO: Zona = {
  version: 1,
  ciudad: { nombre: "Segovia", lat: 40.9429, lon: -4.1088 },
  provincia: "Segovia",
  municipioIne: 40194,
  comunidad: "la comunidad",
  fuenteFestivos: "Ejemplo",
  festivos: {
    "2026": [["01-01", "Año Nuevo"], ["01-06", "Epifanía del Señor"], ["04-03", "Viernes Santo"], ["05-01", "Fiesta del Trabajo"],
      ["08-15", "Asunción de la Virgen"], ["10-12", "Fiesta Nacional de España"], ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"]],
  },
  localesReserva: [],
  ideas: [
    { id: "c-ejemplo-paseo", titulo: "Paseo por el casco antiguo", duracion: "rato", coste: "gratis", clima: "sin-lluvia", dificultad: "facil", sitio: "ciudad", etiquetas: ["paseo"] },
  ],
  fechasEspeciales: [],
  sitios: [
    { id: "ejemplo-mirador", nombre: "Mirador de ejemplo", tipo: "mirador", lat: 40.95, lon: -4.12 },
    { id: "ejemplo-castillo", nombre: "Castillo de ejemplo", tipo: "castillo", lat: 41.2, lon: -4.5 },
  ],
};
