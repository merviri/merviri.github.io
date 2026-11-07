import type { Merviri } from "../../app/app";
import { problemaToken } from "../../dominio/acceso";
import { esFecha, fechaLarga } from "../../dominio/fechas";
import { campo, campoSecreto, conBoton, h, tostada } from "../dom";
import { puntoPersona, texto, volver } from "./comunes";

/** Renovar el token sin repetir el QR en los demás dispositivos. */
export function vistaToken(app: Merviri): HTMLElement {
  const c = app.conexion;
  const pareja = app.pareja();
  const dispositivos = app.dispositivos();
  const todosAlDia = dispositivos.every((d) => app.tokenAlDia(d));

  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "submit", class: "boton boton-primario" }, "Usar este token");
  const f = h("form", { class: "formulario" },
    campoSecreto("token", "Token nuevo", { ayuda: "Empieza por github_pat_." }),
    campo("Caduca el", h("input", { name: "caduca", type: "date", required: true })),
    error,
    h("div", {}, boton),
  );
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(boton, async () => {
      const d = new FormData(f);
      const token = texto(d, "token").trim();
      const problema = problemaToken(token);
      if (problema) throw new Error(problema);
      const caduca = texto(d, "caduca");
      await app.renovarToken(token, esFecha(caduca) ? caduca : null);
      f.reset();
      tostada("Token nuevo en uso. Los demás dispositivos lo recogerán al abrir Merviri.");
      app.refrescar();
    }, error);
  });

  return h("section", {},
    volver(),
    h("h1", {}, "Renovar el token"),
    c?.caduca ? h("p", {}, "El token actual caduca el ", h("b", {}, fechaLarga(c.caduca)), ".") : null,
    h("div", { class: "tarjeta" },
      h("h2", {}, "1. Crea un token nuevo en GitHub"),
      h("p", {}, "Con los mismos ajustes que el actual (no lo «regeneres»: así el antiguo sigue funcionando mientras los demás dispositivos se cambian):"),
      h("ul", {},
        h("li", {}, "Resource owner: ", h("b", {}, c?.propietario ?? "merviri")),
        h("li", {}, "Expiration: dentro de un año (por ejemplo, cerca de vuestro aniversario)"),
        h("li", {}, "Repository access: ", h("b", {}, "datos"), " y ", h("b", {}, "fotos-1"), " a ", h("b", {}, "fotos-5")),
        h("li", {}, "Permissions: ", h("b", {}, "Contents"), " y ", h("b", {}, "Actions"), ": Read and write"),
      ),
      h("a", { class: "boton", href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer" },
        "Abrir GitHub"),
    ),
    h("div", { class: "tarjeta" },
      h("h2", {}, "2. Pégalo aquí"),
      f,
    ),
    h("div", { class: "tarjeta" },
      h("h2", {}, "3. Espera a que todos lo usen"),
      h("ul", { class: "lista" }, dispositivos.map((d) => h("li", {},
        puntoPersona(pareja, d.persona),
        h("span", { class: "crece" }, h("b", {}, d.nombre)),
        app.tokenAlDia(d)
          ? h("span", { class: "pastilla pastilla-turquesa" }, "al día")
          : h("span", { class: "pastilla pastilla-aviso" }, "token antiguo"),
      ))),
      h("p", { class: "secundario arriba" },
        todosAlDia
          ? "Cuando renueves y todos estén «al día», ya puedes borrar el token antiguo en GitHub."
          : "Cada dispositivo se cambia solo al abrir Merviri. Cuando todos estén «al día», borra el token antiguo en GitHub."),
    ),
  );
}
