import { enumerar } from "../dominio/avisos";
import { esDe, type Evento } from "../dominio/calendario";
import { fechaCorta, fechaLarga, type Fecha } from "../dominio/fechas";
import type { Capsula, Deseo, Votacion } from "../dominio/juntas";
import type { Destino } from "../dominio/dibujos";
import type { Lista } from "../dominio/listas";
import { resumen, type Nota } from "../dominio/notas";
import type { Plan } from "../dominio/planes";
import { dinero, type Bote, type Gasto } from "../dominio/gastos";
import type { Album } from "../dominio/album";
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

export function avisarPlan(app: Merviri, p: Plan) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "plan", para: otraPersona(app.persona), clave: "planes", texto: p.titulo,
    aviso: (titulos) => ({
      t: titulos.length > 1 ? `✨ ${quien} ha apuntado ${titulos.length} ideas` : `✨ Idea de ${quien}`,
      b: `${enumerar(titulos)} · ¿Cuántas ganas tienes?`, r: titulos.length > 1 ? "planes" : `plan/${p.id}`, e: "planes-nuevos",
    }),
  });
}

export function avisarGasto(app: Merviri, b: Bote, g: Gasto) {
  if (g.tipo !== "gasto") return;
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "gasto", para: otraPersona(app.persona), clave: b.id, texto: `${g.concepto} (${dinero(g.importe, b.moneda)})`,
    aviso: (textos) => ({
      t: `💶 ${b.emoji} ${b.nombre}`,
      b: `${quien} ha apuntado ${textos.length === 1 ? textos[0] : enumerar(textos)}`, r: `bote/${b.id}`, e: `gastos-${b.id}`,
    }),
  });
}

export function avisarFotos(app: Merviri, n: number, album: Album | null) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "foto", para: otraPersona(app.persona), clave: album?.id ?? "fotos", texto: String(n),
    aviso: (ns) => {
      const total = ns.reduce((a, x) => a + Number(x), 0);
      return {
        t: `📷 ${quien} ha subido ${total === 1 ? "una foto" : `${total} fotos`}`,
        b: album ? `${album.emoji} ${album.nombre}` : "Al álbum de Merviri", r: album ? `album/${album.id}` : "album", e: `fotos-${album?.id ?? "todas"}`,
      };
    },
  });
}

/** Has contestado la pregunta del día. */
export function avisarRespuesta(app: Merviri, fecha: Fecha, otraYaHaContestado: boolean) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "pareja", para: otraPersona(app.persona), clave: `pregunta-${fecha}`,
    aviso: () => ({
      t: `💬 ${quien} ha contestado la pregunta del día`,
      b: otraYaHaContestado ? "Ya podéis ver las dos respuestas ✨" : "Contesta tú para ver su respuesta",
      r: "pregunta", e: `pregunta-${fecha}`,
    }),
  });
}

export function avisarVotacion(app: Merviri, v: Votacion) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "pareja", para: otraPersona(app.persona), clave: `votacion-${v.id}`,
    aviso: () => ({ t: `🗳️ ${quien} quiere decidir contigo`, b: `${v.pregunta} · Tu voto es secreto hasta que votéis las dos`, r: `votacion/${v.id}`, e: `votacion-${v.id}` }),
  });
}

/** Has votado y la otra ya lo había hecho: ya hay resultado. */
export function avisarResultado(app: Merviri, v: Votacion) {
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "pareja", para: otraPersona(app.persona), clave: `votacion-${v.id}`,
    aviso: () => ({ t: `🗳️ ${quien} ha votado: ¡ya está decidido!`, b: v.pregunta, r: `votacion/${v.id}`, e: `votacion-${v.id}` }),
  });
}

export function avisarCapsula(app: Merviri, c: Capsula) {
  const otra = otraPersona(app.persona);
  if (c.para !== otra && c.para !== "ambas") return;
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "pareja", para: otra, clave: `capsula-${c.id}`,
    aviso: () => ({
      t: c.para === "ambas" ? `💌 ${quien} ha guardado una cápsula del tiempo para las dos` : `💌 ${quien} te ha dejado una cápsula del tiempo`,
      b: `Se podrá abrir el ${fechaLarga(c.abrir)}`, r: "capsulas", e: `capsula-nueva-${c.id}`,
    }),
  });
}

/** Un deseo propio nuevo (las ideas de regalo secretas no se avisan). */
export function avisarDeseo(app: Merviri, d: Deseo) {
  if (d.de !== app.persona) return;
  const quien = yo(app);
  app.avisador?.encolar({
    tipo: "pareja", para: otraPersona(app.persona), clave: "deseos", texto: d.titulo,
    aviso: (titulos) => ({ t: `🎁 ${quien} ha apuntado ${titulos.length === 1 ? "un deseo" : `${titulos.length} deseos`}`, b: enumerar(titulos), r: `deseos/${d.de}`, e: `deseos-${d.de}` }),
  });
}
