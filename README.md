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
```

Cada fichero de `datos/` tiene registros `{ id, actualizado, por, … }`.
- **Si las dos cambian cosas distintas a la vez**, los cambios se suman.
- **Si cambian el mismo registro**, gana el cambio más reciente.
- **Los borrados** se guardan como marcas, para que también lleguen a los demás dispositivos.

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
- [ ] **b.** Listas, tareas con turnos, notas y dibujos.
- [ ] **c.** Notificaciones (Web Push enviado por GitHub Actions).
- [ ] **d.** Calendario común, horario habitual y fechas importantes.
- [ ] **e.** Planes y deseos, Descubrir (agenda de Valladolid, mercadillos, sitios) y recomendador.
- [ ] **f.** Gastos tipo Tricount.
- [ ] **g.** Recetas, menú semanal y lista de la compra.
- [ ] **h.** Álbum compartido con fotos originales.
- [ ] **i.** Cosas de pareja: pregunta del día, votaciones, cápsulas del tiempo…

## Licencias de terceros

- [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), vía `@fontsource-variable/nunito`.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT). «QR Code» es marca registrada de DENSO WAVE.
