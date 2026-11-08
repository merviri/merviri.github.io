# Merviri ✨

La app de Elvira y María: se usa desde el móvil y el ordenador, y las dos ven lo mismo.
Es una aplicación web instalable (PWA) publicada en **https://merviri.github.io**.
Los datos se guardan **cifrados** en el repositorio privado `merviri/datos`.

## Cómo protege los datos

- **El código es público y no lleva datos.** Este repositorio (`merviri/merviri.github.io`) solo contiene la app.
- **Los datos van en repositorios privados** de la organización `merviri`: `datos`, y `fotos-1` a `fotos-5` para el álbum.
- **Cifrado de extremo a extremo.** Cada fichero de `datos/` es un «sobre» cifrado con AES-GCM-256 (WebCrypto).
  - La clave de datos es aleatoria. Está guardada en `llavero.json`, envuelta dos veces: con la contraseña común (PBKDF2-SHA256, 600.000 iteraciones) y con el código de recuperación.
  - GitHub solo ve datos ilegibles. La pista de la contraseña es lo único que va en claro.
- **En cada dispositivo**, lo guardado (copia de los datos, cambios pendientes y token) también va cifrado con esa clave. La clave queda en el navegador y no se puede exportar.
- **La app solo habla con `api.github.com`.** Lo garantiza la política de seguridad de contenidos de la versión publicada. Nunca se inserta HTML con datos.
- **Cambiar la contraseña** solo vuelve a envolver la clave: los dispositivos ya vinculados siguen funcionando.

## Puesta en marcha (una vez)

1. **Organización** `merviri` (gratuita) en GitHub. Ya está creada.
2. **Repositorios** de la organización:
   - `merviri.github.io`: público, con este código. En Settings → Pages → Source: «GitHub Actions».
   - `datos`: privado y vacío.
   - `fotos-1`, `fotos-2`, `fotos-3`, `fotos-4` y `fotos-5`: privados y vacíos. Se usarán en el álbum; cuando uno se acerque a 5 GB, la app pasará al siguiente.
3. **Token de grano fino** (lo crea Elvira en https://github.com/settings/personal-access-tokens/new):
   - Token name: `Merviri`
   - Resource owner: **merviri**
   - Expiration: una fecha dentro de un año (apúntala; la app avisará dos semanas antes)
   - Repository access: *Only select repositories* → `datos`, `fotos-1` … `fotos-5` (**no** `merviri.github.io`)
   - Permissions → Repository permissions:
     - **Contents: Read and write**
     - **Actions: Read and write** (lo usarán las notificaciones)
     - Metadata: Read-only, que se añade sola
   - Si GitHub pide aprobarlo, apruébalo en la organización: Settings → Personal access tokens → Pending requests.
4. **Primer dispositivo** (el de Elvira): abre https://merviri.github.io → «Empezar Merviri».
   1. Pega el token y su fecha.
   2. Elige la contraseña común (y una pista, si quieres).
   3. Guarda el código de recuperación.
5. **Móvil de María**: en el móvil de Elvira, Ajustes → «Vincular otro dispositivo». María escanea el QR con la cámara y escribe la contraseña. Después, en Chrome: menú ⋮ → «Instalar aplicación».

## Avisos (notificaciones)

Cada móvil se suscribe en Ajustes → Avisos (Push API del navegador). Su dirección y sus claves se guardan cifradas en `datos/suscripciones.json`.

- **Al momento** (dibujo, ❤️, «recuérdaselo», tarea nueva, cosas en una lista):
  1. El móvil que hace el cambio cifra el aviso para cada móvil de la otra (RFC 8291).
  2. Lanza el flujo `avisos.yml` de `merviri/datos` (`workflow_dispatch`).
  3. El flujo lo firma con la clave VAPID (secreto `VAPID_PRIVADA`) y lo entrega al servicio de avisos.

  Los avisos se juntan unos segundos para gastar menos.
- **Con hora** (resumen de la mañana a las 9:00, aniversarios y días redondos):
  - Cuando cambian las tareas o la pareja, la app recalcula los próximos 7 días y deja los avisos ya cifrados en `avisos/programados.json`.
  - El mismo flujo se ejecuta cada hora y manda los que tocan.
- **Privacidad**: ni GitHub ni Google pueden leer el contenido; solo ven que se manda un aviso y a qué dirección.
- **Coste**: cada ejecución gasta 1 minuto de los 2.000 gratuitos al mes de la organización. Las ejecuciones por hora son unas 500 al mes. Además hay un límite de 60 envíos al día por dispositivo.
- **Copia del flujo**: el flujo y su script están también en `avisos-datos/` de este repositorio (con pruebas en `tests/avisos.test.ts`).

## Renovar el token (una vez al año)

- **Crear el nuevo:** crea un token **nuevo** con los mismos ajustes. No uses «Regenerate», porque inutiliza el antiguo al momento.
- **Ponerlo en la app:** en Merviri, Ajustes → «Renovar el token», y pégalo.
- **Los demás dispositivos** lo recogen solos al abrir la app, mientras el antiguo siga funcionando. Cuando todos aparezcan «al día», borra el token antiguo en GitHub.

## Estructura del repositorio de datos

```
llavero.json                clave de datos envuelta (contraseña y código de recuperación) + pista
datos/pareja.json           nombres, colores y fecha (cifrado)
datos/dispositivos.json     dispositivos vinculados (cifrado)
datos/acceso.json           token vigente, para renovarlo sin repetir el QR (cifrado)
datos/listas.json           listas (nombre e icono)
datos/listas/<id>.json      elementos de cada lista
datos/tareas.json           tareas (responsable, turnos, fecha, repetición, recordatorio)
datos/notas.json            notas
datos/dibujos.json          ficha de cada dibujo (para quién, fondo)
datos/dibujos/<id>.json     trazos de cada dibujo (puntos en un lienzo de 900×1600)
datos/reacciones.json       visto y ❤️ de cada persona en cada dibujo
datos/calendario/<año>.json eventos sueltos, por año de inicio
datos/calendario/repetidos.json  eventos que se repiten (cumpleaños, clases…)
datos/horarios.json         horario habitual de cada una
datos/suscripciones.json    avisos: dirección y claves de cada móvil
datos/planes.json           planes y deseos
datos/ganas.json            ganas de cada una en cada plan
datos/gastos/botes.json     botes de gastos (Casa, viajes…) y sus amigos
datos/gastos/<bote>.json    gastos y pagos de cada bote (importes en céntimos)
datos/gastos/fijos.json     gastos fijos que se apuntan solos cada mes
datos/recetas.json          recetas (ingredientes y pasos)
datos/menu/<año>.json       menú: un registro por día y comida
datos/album/<año>.json      ficha de cada foto (repositorio, fecha, álbumes, favorita, papelera)
datos/album/albumes.json    álbumes (también los de los planes)
datos/preguntas/<año>.json  respuestas a la pregunta del día (una por persona y día)
datos/votaciones.json       «decidir juntas»; datos/votos.json, un voto por persona
datos/capsulas.json         cápsulas del tiempo (la app no las enseña hasta su fecha)
datos/fichas.json           ficha «bueno saber» de cada una (cumpleaños, tallas, gustos)
datos/deseos.json           deseos e ideas de regalo; datos/reservas.json, «me lo pido»
```

Las fotos van en `merviri/fotos-1` … `fotos-5` como `fotos/AAAA/MM/<id>.mini|.vista|.orig`, cifradas (`MRV1` + id de clave + IV + AES-GCM). Vaciar la papelera rehace ese repositorio sin las fotos borradas y sin historial (commit sin padres), así el espacio se libera de verdad.

Todos los ficheros de `datos/` van cifrados.

Cada fichero de `datos/` tiene registros `{ id, actualizado, por, … }`.
- **Si las dos cambian cosas distintas a la vez**, los cambios se suman.
- **Si cambian el mismo registro**, gana el cambio más reciente.
- **Los borrados** se guardan como marcas, para que también lleguen a los demás dispositivos. Las marcas se limpian a los 90 días.

## Desarrollo

```bash
npm install
npm test           # pruebas unitarias
npm run typecheck  # comprobación de tipos
npm run dev        # http://localhost:5173
npm run iconos     # vuelve a generar los iconos (scripts/iconos.mjs)
```

En desarrollo, el token `falso` usa un repositorio de mentira guardado en el navegador. Así se puede probar todo sin GitHub.
- **Para simular otro dispositivo**, abre `http://localhost:5173/?dispositivo=2`.
- **El modo falso no existe en la versión publicada.**

Al subir a `main`, `.github/workflows/publicar.yml` pasa las pruebas, compila y publica en GitHub Pages. Los móviles ven el aviso «Hay una versión nueva» y se actualizan con un toque.

## Fases

- [x] **a.** Base: icono, conexión, cifrado, sincronización, instalación, vinculación por QR, renovación del token, recuperación.
- [x] **b.** Listas, tareas con turnos y recordatorios, notas y dibujos (con aviso al abrir la app).
- [x] **c.** Avisos (Web Push): dibujos, ❤️, «recuérdaselo», tareas y listas al momento; resumen de la mañana y aniversarios con hora.
- [x] **d.** Calendario común (mes, semana con horas y agenda), «ocupada» sin detalles, cumpleaños, horario habitual (con «🌴 Vacaciones / libre», que lo anula esos días u horas), festivos de Valladolid automáticos (Comunidad del BOCyL en `src/dominio/festivos.ts`, que hay que ampliar cada año; locales desde los datos abiertos de la Junta) y recordatorios.
- [x] **e.** Planes y deseos (plazo, dificultad, duración, coste, reserva, clima, temporada, ganas de cada una), Descubrir (catálogo, agenda de la Junta, fechas especiales, sitios cercanos) y «¿Qué hacemos?» (huecos libres + tiempo de Open-Meteo).
- [x] **f.** Gastos tipo Tricount: un único balance entre las dos que suma todos sus botes (Casa, viajes, planes: los botes sirven para ver cuánto ha costado cada cosa) y botes con amigos con sus propias cuentas, repartos a partes iguales, por partes o por importes, saldos y cómo saldar, varias monedas (cambio del BCE), gastos fijos mensuales, resumen y CSV.
- [x] **g.** Recetas, menú semanal (comida y cena, quién cocina) y lista de la compra por secciones del súper.
- [x] **h.** Álbum compartido: originales cifrados (y miniatura y vista), por meses, álbumes y álbumes de planes, favoritas, papelera que libera espacio de verdad, ZIP para el ordenador y «Compartir → Merviri» desde la galería de Android.
- [x] **i.** «Nosotras»: pregunta del día (la de la otra se ve al contestar tú, con racha), decidir juntas (voto secreto y desempate al azar), cápsulas del tiempo, fichas «bueno saber» con cumpleaños, deseos con «me lo pido» e ideas de regalo secretas, y «Nuestro año».

## Licencias de terceros

- [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), vía `@fontsource-variable/nunito`.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). «QR Code» es marca registrada de DENSO WAVE.
