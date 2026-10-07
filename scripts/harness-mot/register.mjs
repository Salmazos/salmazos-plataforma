// Registra os hooks de resolução/transpilação (ver hooks.mjs). Uso:
//   HARNESS_ROOT=<raiz do checkout> node --import ./scripts/harness-mot/register.mjs <script>
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./hooks.mjs", pathToFileURL(import.meta.filename));
