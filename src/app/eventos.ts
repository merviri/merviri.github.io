import { enumerar } from "../dominio/avisos";
import { esDe, type Evento } from "../dominio/calendario";
import { fechaCorta } from "../dominio/fechas";
import type { Destino } from "../dominio/dibujos";
import type { Lista } from "../dominio/listas";
import { resumen, type Nota } from "../dominio/notas";
import { otraPersona, type IdPersona } from "../dominio/pareja";
import { aQuien, type Tarea } from "../dominio/tareas";
import type { Merviri } from "./app";

/** Qué avisa Merviri a la otra cuando haces algo. */

const yo = (app: Merviri) => app.pareja().personas[app.persona].nombre;

export function avisarDibujo(app: Merviri, id: string, para: Destino) {
  const otra = otraPersona(app.persona);
  if (para !== otra && para !== "ambas") return;
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "dibujo", para: otra, clave: id,
    aviso: () => ({
      t: para === "ambas" ? `🎨 ${quien} ha pintado en el mural` : `🎨 ${quien} te ha dejado un dibujo`,
      b: "Ábrelo en Merviri ✨", r: `dibujo/${id}`, e: `dibujo-${id}`,
    }),
  });
}

export function avisarMeGusta(app: Merviri, dibujo: string, autor: IdPersona) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "megusta", para: autor, clave: dibujo,
    aviso: () => ({ t: `❤️ A ${quien} le ha gustado tu dibujo`, b: "", r: `dibujo/${dibujo}`, e: `megusta-${dibujo}` }),
  });
}

export function avisarRecordatorio(app: Merviri, t: Tarea, para: IdPersona) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "recordatorio", para, clave: t.id,
    aviso: () => ({ t: `🔔 ${quien} te recuerda`, b: t.titulo, r: "tareas", e: `recordatorio-${t.id}` }),
  });
}

/** Tarea nueva (o que ha pasado a ser de la otra). */
export function avisarTarea(app: Merviri, t: Tarea, antes: Tarea | null) {
  const otra = otraPersona(app.persona);
  const esDeLaOtra = (x: Tarea | null) => !!x && (aQuien(x) === otra || aQuien(x) === "ambas");
  if (!esDeLaOtra(t) || (antes && esDeLaOtra(antes))) return;
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "tarea", para: otra, clave: "tareas", texto: t.titulo,
    aviso: (titulos) => ({
      t: titulos.length > 1 ? `✅ ${quien} te ha puesto ${titulos.length} tareas` : `✅ Tarea nueva de ${quien}`,
      b: enumerar(titulos), r: "tareas", e: "tareas-nuevas",
    }),
  });
}

export function avisarElemento(app: Merviri, lista: Lista, texto: string) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "lista", para: otraPersona(app.persona), clave: lista.id, texto,
    aviso: (textos) => ({
      t: `${lista.emoji} ${lista.nombre}`,
      b: textos.length === 1 ? `${quien} ha añadido «${textos[0]}»` : `${quien} ha añadido ${enumerar(textos.map((x) => `«${x}»`))}`,
      r: `lista/${lista.id}`, e: `lista-${lista.id}`,
    }),
  });
}

export function avisarNota(app: Merviri, n: Nota) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "nota", para: otraPersona(app.persona), clave: n.id,
    aviso: () => ({ t: `🗒️ Nota nueva de ${quien}`, b: n.titulo.trim() || resumen(n.texto, 100), r: `nota/${n.id}`, e: `nota-${n.id}` }),
  });
}

/** Algo nuevo en el calendario que es de la otra (o de las dos). Los «ocupada» no se avisan. */
export function avisarEvento(app: Merviri, e: Evento, antes: Evento | null) {
  const otra = otraPersona(app.persona);
  if (!esDe(e, otra) || (antes && esDe(antes, otra))) return;
  const quien = yo(app);
  const cuando = `${fechaCorta(e.inicio)}${e.todoElDia || !e.horaInicio ? "" : `, ${e.horaInicio}`}`;
  app.avisador?.encolar({
    tipo: "evento", para: otra, clave: "eventos", texto: `${e.titulo} (${cuando})`,
    aviso: (textos) => ({
      t: textos.length > 1 ? `📅 ${quien} ha apuntado ${textos.length} cosas` : `📅 ${quien} ha apuntado en el calendario`,
      b: enumerar(textos), r: `calendario/${e.inicio}`, e: "eventos-nuevos",
    }),
  });
}
