import type { Merviri } from "../../app/app";
import { avisosSoportados, permisoAvisos } from "../../avisos/suscripcion";
import { PREFERENCIAS_INICIALES, quiere, TIPOS_AVISO, type Preferencias, type TipoAviso } from "../../dominio/avisos";
import { campo, conBoton, confirmarPeligro, h, tostada } from "../dom";
import { texto } from "./comunes";

/** Tarjeta de Ajustes: activar los avisos en este dispositivo y elegir cuáles. */
export function tarjetaAvisos(app: Merviri): HTMLElement {
  const tarjeta = h("div", { class: "tarjeta", id: "tarjeta-avisos" }, h("h2", {}, "Avisos"));
  if (!avisosSoportados()) {
    tarjeta.append(h("p", { class: "secundario" }, import.meta.env.DEV
      ? "Los avisos solo funcionan en la app publicada (merviri.github.io)."
      : "Este navegador no admite avisos. En Android, usa Chrome."));
    return tarjeta;
  }
  const permiso = permisoAvisos();
  const mia = app.miSuscripcion();
  const error = h("p", { class: "error", role: "alert" });

  if (permiso === "denied") {
    tarjeta.append(
      h("p", {}, "Los avisos están bloqueados en este navegador."),
      h("p", { class: "secundario" }, "En Chrome: menú ⋮ → Información del sitio (o el candado) → Notificaciones → Permitir. Después vuelve aquí."),
    );
    return tarjeta;
  }

  if (!mia) {
    const activar = h("button", { type: "button", class: "boton boton-primario" }, "🔔 Activar avisos en este dispositivo");
    activar.addEventListener("click", () => void conBoton(activar, async () => {
      await app.activarAvisos();
      tostada("Avisos activados ✨");
      app.refrescar();
    }, error));
    tarjeta.append(
      h("p", {}, "Recibe aquí los dibujos, los «recuérdaselo» y el resumen de la mañana, aunque Merviri esté cerrada."),
      error,
      h("div", { class: "botones" }, activar),
    );
    return tarjeta;
  }

  const prefs: Preferencias = mia.prefs ?? PREFERENCIAS_INICIALES;
  const casillas = TIPOS_AVISO.map((t) => h("label", { class: "casilla" },
    h("input", { type: "checkbox", name: `tipo-${t.tipo}`, checked: quiere(mia, t.tipo) }),
    h("span", {}, t.texto)));
  const desde = h("input", { type: "time", name: "desde", value: prefs.silencioDesde ?? "" });
  const hasta = h("input", { type: "time", name: "hasta", value: prefs.silencioHasta ?? "" });
  const guardar = h("button", { type: "submit", class: "boton boton-primario" }, "Guardar");
  const form = h("form", { class: "formulario" },
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Quiero que me avise de…"), casillas),
    h("div", { class: "fila" },
      campo("Silencio desde", desde),
      campo("hasta", hasta)),
    h("p", { class: "ayuda" }, "En esas horas los avisos llegan sin sonido ni vibración."),
    error,
    h("div", {}, guardar),
  );
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(guardar, async () => {
      const d = new FormData(form);
      const tipos: Partial<Record<TipoAviso, boolean>> = {};
      for (const t of TIPOS_AVISO) tipos[t.tipo] = d.get(`tipo-${t.tipo}`) === "on";
      const sd = texto(d, "desde");
      const sh = texto(d, "hasta");
      await app.guardarPreferencias({ tipos, silencioDesde: sd || null, silencioHasta: sh || null });
      tostada("Guardado");
    }, error);
  });

  const probar = h("button", { type: "button", class: "boton" }, "Mandar un aviso de prueba");
  probar.addEventListener("click", () => void conBoton(probar, async () => {
    await app.avisador?.probar();
    tostada("Enviado: llegará en unos 30–60 segundos.");
  }, error));
  const desactivar = h("button", { type: "button", class: "boton boton-peligro" }, "Desactivar");
  desactivar.addEventListener("click", async () => {
    if (!(await confirmarPeligro("Desactivar los avisos", "Este dispositivo dejará de recibir avisos.", "Desactivar"))) return;
    await conBoton(desactivar, async () => {
      await app.desactivarAvisos();
      app.refrescar();
    }, error);
  });

  tarjeta.append(
    h("p", {}, "✅ Activados en este dispositivo."),
    form,
    h("div", { class: "botones" }, probar, desactivar),
    app.avisador?.ultimoError ? h("p", { class: "error" }, `Último problema: ${app.avisador.ultimoError}`) : "",
    h("p", { class: "secundario pequeno arriba" },
      "Los manda GitHub (gratis: Merviri los junta para gastar poco) y van cifrados para este móvil: ni GitHub ni Google pueden leerlos."),
  );
  return tarjeta;
}

/** Tarjeta de la portada para animar a activarlos. */
export function tarjetaActivarAvisos(app: Merviri): HTMLElement | null {
  if (!avisosSoportados() || permisoAvisos() !== "default" || app.miSuscripcion()) return null;
  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "button", class: "boton boton-primario" }, "Activar avisos");
  boton.addEventListener("click", () => void conBoton(boton, async () => {
    await app.activarAvisos();
    tostada("Avisos activados ✨");
    app.refrescar();
  }, error));
  return h("div", { class: "tarjeta tarjeta-morada" },
    h("p", {}, h("b", {}, "🔔 ¿Activamos los avisos?")),
    h("p", {}, "Para enterarte de los dibujos y recordatorios aunque Merviri esté cerrada."),
    error,
    h("div", { class: "botones" }, boton, h("a", { class: "boton", href: "#ajustes" }, "Elegir cuáles")),
  );
}
