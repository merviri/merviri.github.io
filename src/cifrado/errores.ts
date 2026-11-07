/** La contraseña o el código no abren la clave, o un fichero cifrado está dañado. */
export class ErrorDescifrado extends Error {
  constructor(message = "No se ha podido descifrar.") {
    super(message);
    this.name = "ErrorDescifrado";
  }
}
