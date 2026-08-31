# Equipos INTI Rafaela — PWA

App instalable (Android/iPhone/PC) que lee y escribe directo sobre una planilla de Google Sheets, y guarda las fotos de cada equipo en una carpeta del Drive compartido. No hay servidor propio ni base de datos aparte: Sheets + Drive **son** la base de datos.

## Qué incluye
- `index.html`, `styles.css`, `app.js` — la app
- `config.js` — acá van tus IDs (lo único que tenés que tocar)
- `manifest.json`, `sw.js`, `icon-*.png` — para que se pueda "instalar" en el celular

## Puesta en marcha (una sola vez)

### 1. Preparar la planilla
La app **ya no depende de en qué columna esté cada dato** — busca cada campo por el **nombre de su encabezado** en la fila 1, sin importar el orden ni cuántas columnas ajenas (contables, patrimoniales, etc.) haya intercaladas alrededor. Esto es importante porque la planilla real se alimenta también de otro sistema institucional que agrega columnas propias con el tiempo.

Los encabezados que la app busca (tienen que existir en la fila 1, con este texto exacto — no importa en qué columna ni en qué orden):

| Encabezado esperado | Campo | Quién lo carga |
|---|---|---|
| N° inventario | N° de inventario | Vos, al alta (bloqueado después) |
| Estado oblea | Estado del sticker de inventario | Vos, al alta (bloqueado después) |
| Código Catálogo | Código de catálogo | Vos, al alta (bloqueado después) |
| Descripción del catálogo | Categoría | Vos, al alta (bloqueado después) |
| Descripción del bien | Descripción | Vos, al alta (bloqueado después) |
| Modelo | Modelo | Vos, al alta (bloqueado después) |
| Serie | N° de serie | Vos, al alta (bloqueado después) |
| Ubicación | Ubicación | Vos, al alta (bloqueado después) |
| Departamento | Departamento | Vos, siempre editable |
| Nuevo Lugar | Lugar físico | Vos, siempre editable |
| Estado de equipo o bien | Estado de uso | Vos, siempre editable |
| Observaciones | Observaciones | Vos, siempre editable |
| Id_foto | ID de la carpeta de fotos en Drive | La app sola |
| Fecha modif | Fecha/hora de la última modificación | La app sola |
| Agente_cambio | Mail de quien modificó | La app sola |
| Nombre carpeta fotos | Nombre real de la carpeta en Drive | La app sola |
| Estado relevamiento | Pendiente/Encontrado/No encontrado | La app sola |
| Ultima edicion | Fecha/hora de la verificación | La app sola |
| Cambió | Mail de quien verificó | La app sola |
| ID foto portada | ID de la foto marcada como portada | La app sola |

**Si alguno de estos encabezados no existe todavía** (por ejemplo, una planilla nueva desde cero), la app lo crea sola la primera vez que se conecta, agregándolo al final de la fila 1 — no hace falta prepararlos todos a mano de antemano.

**Cualquier otra columna que tenga la planilla** (datos contables, de patrimonio, del centro de costo, etc.) **la app la ignora por completo** — nunca la lee ni la escribe, así que no hay riesgo de que la pise o la rompa, sin importar dónde esté ubicada.

Además de esta hoja, la app usa (y crea sola si no existe) una pestaña **"Config"** con la lista de opciones de "Nuevo Lugar" — ver sección correspondiente más abajo.

Ningún campo es obligatorio para guardar.

**Departamento** tiene esta lista fija + "Otro": 10307-DT Metrologia Legal, 10328-DT Litoral Centro, 10538-Administracion Centro, 10623-AVyPS, 10625-TASIM, 10626-VEyC, Lacteos. Si elegís Otro, la app te pide el texto y guarda directamente lo que escribiste (no la palabra "Otro").

**Nuevo Lugar** tiene la lista editable de la pestaña Config (sin opción "Otro" — para agregar un lugar nuevo se usa el botón "+", ver más abajo). **Estado de equipo o bien** tiene una lista fija sin "Otro" (En uso / Fuera de uso / Para dar de baja por rotura o obsolescencia). Al reabrir un equipo, si algún valor guardado no está en su lista correspondiente, la app lo reconoce solo y lo muestra (como opción propia, o con el campo de texto en el caso de Departamento).

**Observaciones** es texto libre.

**Estado relevamiento** queda vacío = "Pendiente"; la app escribe "Encontrado" o "No encontrado" ahí sola cuando tocás los botones de verificación (esa columna y las de fecha/quién se completan juntas).



**ID foto portada** queda vacío hasta que marques una foto con la estrellita en la galería de un equipo.

Anotá el **ID de la planilla**: es la parte de la URL entre `/d/` y `/edit`.
`https://docs.google.com/spreadsheets/d/`**`ESTE_ES_EL_ID`**`/edit`

### 2. Preparar la carpeta de fotos en el Drive compartido
Creá una carpeta (ej. "Fotos equipos") dentro del Drive compartido de INTI. Anotá su ID de la misma forma, mirando la URL cuando la tenés abierta.

### 3. Crear las credenciales en Google Cloud
1. Andá a [console.cloud.google.com](https://console.cloud.google.com) y creá un proyecto.
2. **APIs y servicios → Biblioteca**: activá **Google Sheets API** y **Google Drive API** (las dos, por separado — si falta una, la app no rompe pero la parte correspondiente no va a andar).
3. **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: como el equipo usa Gmail comunes (no Workspace de INTI), tiene que ser **Externo**.
   - Vas a quedar en estado **"Pruebas" (Testing)** — para este uso está bien, no hace falta pasar a producción (ver "Sobre el estado *Testing*" más abajo).
   - En **Usuarios de prueba**, agregá el Gmail de **cada persona** que va a usar la app (hasta 100). Si un Gmail no está en esta lista, Google le va a rechazar el acceso aunque tenga el link.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**.
5. En **Orígenes autorizados de JavaScript** agregá la URL donde vas a publicar la app (ver paso 5), por ejemplo `https://tuusuario.github.io`. Guardá y copiá el **Client ID**.

#### Sobre el estado "Testing"
Como la app pide permiso amplio sobre Drive, para sacarla de "Testing" Google exige un proceso de verificación con auditoría de seguridad — pensado para apps públicas, no para una herramienta interna de laboratorio. Quedarse en "Testing" es lo normal acá, con dos consecuencias chicas:
- Cada usuario, al conectar por primera vez, va a ver un cartel de **"Google no verificó esta app"**. Es esperable: tocan **Avanzado → Ir a (nombre de tu app) (no seguro)** y siguen. No significa que algo esté mal.
- El acceso de cada usuario vence a los **7 días**; pasado ese tiempo alcanza con tocar "Conectar con Google" de nuevo. No hay que reinstalar nada.

### 4. Completar config.js
Abrí `config.js` y pegá tus 4 valores:
```js
CLIENT_ID: "...apps.googleusercontent.com",
SPREADSHEET_ID: "el ID de la planilla",
SHEET_NAME: "Equipos",          // el nombre exacto de la pestaña
PHOTOS_FOLDER_ID: "el ID de la carpeta de Drive",
```

### 5. Publicar
Igual que veníamos pensando para el otro proyecto: gratis, sin servidor.
- **GitHub Pages:** subí esta carpeta a un repo y activá Pages, o
- **Netlify:** arrastrá la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop)

Después de publicar, si cambió la URL final, volvé al paso 3.5 y agregala en "Orígenes autorizados de JavaScript".

### 6. Usarla
Cada persona entra a la URL con su cuenta Google de INTI, toca **Conectar con Google**, y listo. En el celular, el navegador va a ofrecer "Agregar a pantalla de inicio" — así queda como una app más.

## Columnas por nombre, no por posición
La app busca cada campo por el **texto exacto del encabezado** en la fila 1 (ver la tabla en "Preparar la planilla"), no por una letra de columna fija. Ventajas concretas:
- Si el sistema institucional de patrimonio agrega, saca o reordena columnas propias (contables, del centro de costo, etc.), la app **sigue funcionando sin tocar nada** — vuelve a encontrar cada campo por su nombre la próxima vez que se conecta.
- Cualquier columna que la app no tenga en su lista (valor de origen, amortizaciones, expediente de compra, etc.) **la ignora por completo** — nunca la lee ni la escribe. Actualmente son excepción **Año, Proveedor y Responsable Patrimonial**, que sí se muestran en la ficha (solo lectura, nunca se editan — Año arriba de los campos bloqueados, Proveedor y Responsable Patrimonial como campos propios dentro de ese mismo grupo) — el resto sigue afuera hasta que se decida sumarlas.
- Al guardar, la app escribe **cada campo en su celda individual** (no un bloque de columnas seguidas) — así nunca corre ni pisa una columna vecina que no le pertenece.
- Si en algún momento falta alguno de los encabezados que la app necesita (por ejemplo, en una planilla nueva), los crea solos al final de la fila 1 la primera vez que se conecta.

## Campos bloqueados vs. campos editables
Las columnas N° inventario, Estado oblea, Código Catálogo, Descripción del catálogo, Descripción del bien, Modelo, Serie y Ubicación son los datos originales del alta patrimonial. En la app quedan **siempre bloqueadas** (fondo gris, no se pueden tocar) — la app no permite dar de alta equipos nuevos directamente en esta planilla (ver "Altas pendientes" más abajo). Si hay que corregir un dato de esta zona, se edita directo en la planilla de Google Sheets.

Los campos de gestión (Departamento, Nuevo Lugar, Estado de equipo o bien, **Código SGC**, Observaciones) siempre quedan editables, con fondo ámbar, para diferenciarlos a simple vista de los bloqueados. **Código SGC** solo acepta números — cualquier otro carácter se filtra solo mientras se escribe. Está presente en la ficha de equipo y en la de Alta pendiente por igual.

## Identificación de equipos y nombre de las carpetas de fotos
La ficha y la tarjeta de cada equipo siempre muestran el valor literal de "N° inventario" — aunque diga "S/D". No se inventa ningún código para reemplazarlo.

Las carpetas de fotos quedan **organizadas por Nuevo Lugar** dentro de tu carpeta de fotos general: `Fotos equipos / Sala 16 / 105C000544 - Sala 16`. La subcarpeta de cada lugar se crea sola la primera vez que hace falta (y se reutiliza después para todos los equipos de ese mismo lugar) — no hay que crearlas a mano.

El nombre de la carpeta de cada equipo, dentro de su lugar, es siempre: `{N° inventario} - {Nuevo Lugar}` (ej. `105C000544 - Sala 3`, o `S/D - Sala 16` si no tiene inventario).

Si dos equipos generarían el mismo nombre (por ejemplo, varios "S/D" en el mismo lugar), la app agrega un sufijo numérico **pegado al N° de inventario**, antes del lugar: `S/D-2 - Sala 16`, `S/D-3 - Sala 16`, etc.

El nombre final queda guardado también en "Nombre carpeta fotos" en la planilla, para poder identificar la carpeta sin entrar a Drive.

**Si cambiás el Nuevo Lugar de un equipo que ya tiene fotos**, la app mueve sola la carpeta a la subcarpeta del lugar nuevo y le actualiza el nombre — no queda "perdida" en el lugar viejo. Esto pasa automáticamente al guardar la ficha, sin ningún paso extra. Si por algún motivo el movimiento falla (por ejemplo, un corte de conexión), el equipo igual se guarda bien — la app avisa aparte que la carpeta no se pudo mover, para revisarlo a mano en Drive si hace falta.

(El campo "ID interno" quedó en desuso — ya no hace falta para nombrar carpetas, y ya no forma parte de los encabezados que la app busca.)

## Cómo funciona por dentro
- **Lista completa** → al conectar, la pantalla principal ya muestra todos los equipos como tarjetas (con buscador y filtros arriba). Tocar una tarjeta abre su ficha para editar los campos de gestión o agregar fotos. **No se pueden dar de alta equipos nuevos desde acá** — ver "Altas pendientes" más abajo.
- **Auditoría** → cada vez que se guarda un equipo, la app graba sola la fecha/hora y el mail de quien lo hizo, en "Fecha modif" y "Agente_cambio". Se ve arriba de la ficha al reabrir un equipo ya guardado.
- **Editar un equipo** → escribe directo en la fila de la planilla (Sheets API), celda por celda — nunca toca columnas que la app no gestiona.
- **Cambios sin guardar** → si cerrás la ficha de un equipo (o de un hallazgo) después de haber tocado algún campo, la app pregunta antes de descartar los cambios.
- **Subir una foto** → si el equipo todavía no tiene carpeta, la app crea una subcarpeta con el N° de inventario como nombre dentro de tu carpeta de fotos, sube la imagen ahí, y guarda el ID de esa subcarpeta en "Id_foto".
- **Ver la galería** → la app lista los archivos de esa subcarpeta y los descarga para mostrarlos (por eso tarda un poquito la primera vez que abrís un equipo con fotos).
- Todos los que entran ven los mismos datos porque todos apuntan a la misma planilla y la misma carpeta — no hay copias.
- **No se pueden eliminar registros** de la hoja principal desde la app, a propósito — es una decisión de integridad de datos patrimoniales, no una limitación técnica. Si hace falta borrar una fila, se hace directo en Google Sheets. (Altas pendientes es distinto — ver esa sección.)
- **Fotos comprimidas automáticamente** → antes de subir cualquier foto, la app la redimensiona y comprime en el propio navegador, apuntando a ~300-400KB por imagen (en vez de los 3-8MB típicos de una foto de celular). No hace falta hacer nada — es automático.
- **Ver fotos en grande** → tocar cualquier miniatura de la galería la abre ampliada dentro de la misma app (sin salir a Drive). Desde ahí también hay un link "Abrir en Drive ↗" para descargarla o compartirla si hace falta.
- **Foto de portada** → en la galería, tocar la estrellita ★ de una foto la marca como la que representa a ese equipo en el informe PDF (y a futuro, en cualquier otra vista que muestre "una" foto por equipo). Tocarla de nuevo la desmarca. Si no marcás ninguna, se usa la primera foto subida.
- **Buscador unificado** → si escribís algo en el buscador principal y no hay coincidencias entre los equipos ya registrados (o incluso si las hay), la app también busca en Altas pendientes y muestra esos resultados al final de la lista, con un **borde violeta** y la etiqueta "📋 Hallazgo pendiente" — para no confundirlos con equipos ya oficiales. Tocarlos abre la ficha de esa alta pendiente.

## Lista de lugares editable ("Nuevo Lugar")
La lista de opciones de Nuevo Lugar no está fija en el código — vive en una pestaña **"Config"** de tu misma planilla (la app la crea sola, con los lugares de fábrica, la primera vez que se usa si no existe). El desplegable de Nuevo Lugar no tiene opción "Otro" — para agregar un lugar que no está en la lista, tocá el botón **"+"** al lado del desplegable (en la ficha), escribilo, y listo.

Se agrega al instante para todos los usuarios (no pide confirmación) y queda disponible en el desplegable de ahí en adelante. También podés editar la lista directamente en la pestaña Config de Sheets si preferís (un lugar por fila, a partir de la fila 2).

## Relevamiento / verificación de inventario
Pensada para recorrer el laboratorio con el celular confirmando que cada equipo está donde dice la planilla:
- Cada equipo tiene un **Estado de verificación**: Pendiente (por defecto, no aparece en la planilla como texto — es "vacío"), Encontrado, o No encontrado.
- **Solo se marca desde la ficha completa** (✓ Encontrado / ✕ No encontrado, con fecha y quién) — a propósito no hay botones de verificación en la tarjeta de la lista, para evitar toques accidentales al scrollear. Tocar el mismo botón otra vez lo vuelve a dejar en Pendiente (por si te equivocaste).
- **Las tarjetas se colorean solas**: verde si el equipo está Encontrado, rojo si está No encontrado, y el color normal si está Pendiente — para ver el estado de un vistazo sin entrar a cada una.
- Los mismos botones están también dentro de la ficha, con la fecha y el mail de quien verificó.
- **Filtros de Nuevo Lugar, Estado de equipo, y "Pendientes / Encontrados / No encontrados"** en la barra de arriba — combinables entre sí, permiten por ejemplo recorrer "Sala 16, pendientes" o listar todo lo "Fuera de uso".
- **Contador de progreso** arriba de la lista (ej. "43/214 revisados · 3 no encontrados") para tener noción de cuánto queda del relevamiento total.

Como el relevamiento se piensa hacer cada 2-3 años, no cada vez: cuando llegue el próximo, hay que **reiniciar manualmente** el estado de verificación de todos los equipos (borrar el contenido de las columnas "Estado relevamiento", "Ultima edicion" y "Cambió" en la planilla, por ejemplo con un filtro + selección + Suprimir en Google Sheets) para arrancar de cero. La app no lo hace sola a propósito, para no perder el registro de un relevamiento anterior sin querer.

## Informe en PDF
El botón **"📄 Generar informe PDF"**, arriba de la lista, genera un informe con los equipos que están visibles según los filtros/búsqueda aplicados en ese momento (no hace falta seleccionar uno por uno).
- 16 fichas por página (2 columnas × 8 filas), cada una con 5 líneas: (1) código + año + estado de verificación coloreado, (2) descripción, (3) categoría · modelo · serie, (4) departamento · lugar (usa Ubicación si Nuevo Lugar está vacío), (5) estado de equipo o bien, en negrita y alineado a la derecha.
- Encabezado con qué filtros están aplicados y la fecha; pie con el total de equipos incluidos.
- Funciona con la función de impresión del navegador: al tocar el botón, se abre el diálogo de impresión — ahí elegís **"Guardar como PDF"** en vez de una impresora física.
- Las fotos se descargan en paralelo (varias a la vez) y se guardan en caché durante la sesión — generar el informe una segunda vez con un filtro parecido es mucho más rápido para las fotos que se repiten. Con muchos equipos filtrados igual puede tardar unos segundos la primera vez (el botón avisa "Cargando fotos X/Y" mientras tanto).

## Seguridad: quién puede entrar
No hace falta que la app controle esto por su cuenta — Google ya lo hace, y de forma más confiable que cualquier chequeo que yo agregue en el navegador (algo así siempre se podría evadir mirando el código). Así queda armado:

- Cada usuario entra con **su propia cuenta de Google**, no hay contraseña compartida.
- Cuando la app intenta leer o escribir la planilla o la carpeta de fotos, es **Google Sheets/Drive quien revisa los permisos** — si esa cuenta no está compartida en el archivo, la operación se rechaza ahí mismo, no importa qué diga el código de la app.
- Entonces: **para dar de baja a alguien, no tenés que tocar la app ni el código** — solo le sacás el acceso a la planilla y a la carpeta de Drive (o dejás de compartírsela). Al toque deja de poder ver o modificar nada, aunque siga teniendo la URL de la app.
- Si alguien entra con una cuenta que sí está autorizada por Google (pasó el paso de "usuarios de prueba") pero **no** tiene compartida la planilla/carpeta, la app se lo muestra con un mensaje de "Sin acceso" en vez de romperse en silencio.

En criollo: la lista de "usuarios de prueba" en Google Cloud controla quién *puede intentar entrar a la app*; compartir (o no) la planilla y la carpeta de Drive controla quién *ve o edita los datos*. Este segundo punto es el que de verdad importa y es el mismo mecanismo de siempre de Google Drive — no hay nada nuevo que aprender a administrar.

### Checklist de alta/baja de personas
Como son dos lugares distintos, conviene hacer siempre los dos pasos juntos para no olvidarse de ninguno:

**Alta de una persona nueva:**
1. Google Cloud Console → APIs y servicios → Pantalla de consentimiento OAuth → Usuarios de prueba → agregar su Gmail.
2. Compartir la planilla y la carpeta de Drive de fotos con ese mismo Gmail, como Editor.

**Baja de una persona:**
1. Sacarle el acceso a la planilla y a la carpeta de Drive (botón Compartir → quitar).
2. Sacarla de la lista de Usuarios de prueba en Google Cloud Console.

El paso 1 de la baja es el que de verdad importa (corta el acceso a los datos al instante); el paso 2 es prolijidad para que esa cuenta ya ni siquiera pueda intentar loguearse.

## Permisos que pide la app
La app pide el scope `drive` completo (no solo `drive.file`) para poder listar y mostrar fotos que ya existan en la carpeta compartida, aunque las haya subido otra persona — es una decisión consciente, no un descuido: `drive.file` rompería la galería compartida entre distintos usuarios (cada uno vería solo lo que subió él mismo). Este permiso amplio está documentado como riesgo aceptado en `analisis-vulnerabilidad-iso27001.md`, con una Content-Security-Policy agregada en `index.html` como mitigación.

## Navegación en el celular (botón "atrás")
La app maneja el botón "atrás" del navegador/Android para que se comporte como se espera dentro de una app:
- Si hay una foto ampliada abierta, "atrás" la cierra.
- Si hay una ficha abierta, "atrás" la cierra (sin perder los datos ya guardados).
- Si no hay nada abierto, "atrás" pregunta "¿Seguro que querés salir de la app?" antes de salir de verdad — para no salir sin querer en medio de un recorrido.
- La sesión se guarda de forma persistente (`localStorage`), así que salir y volver a entrar no pide loguearse de nuevo — pero **expira sola a los 5 días** sin usar la app, por seguridad (después de eso, pide loguearse de nuevo la próxima vez).

## Escáner de código de barras
Junto al buscador hay un botón 📷 que abre la cámara para leer el código de barras pegado en la etiqueta del bien (Code128/Code39). En cuanto lo detecta, lo carga solo en el buscador y filtra la lista — como si lo hubieras tipeado a mano.

**Solo funciona en Android/Chrome** — es una función nativa del navegador (`BarcodeDetector`), sin librerías externas. En iPhone (Safari) no está disponible; ahí el botón avisa que hay que buscar manualmente.

## Altas pendientes
Si escaneás un código y no aparece ningún resultado, la app pregunta si querés cargarlo como **hallazgo nuevo** — un bien que está físicamente en el laboratorio pero todavía no tiene alta patrimonial oficial. Es también el **único** lugar de la app donde se cargan bienes nuevos — la hoja principal ya no lo permite.

- Se guarda en una pestaña aparte, **"Altas pendientes"** (se crea sola, igual que "Config"), con estos campos: N° inventario (el escaneado — puede corresponder a otra repartición, eso se termina de verificar después), Descripción del bien, Modelo, Serie, Departamento, Nuevo Lugar, Estado de equipo o bien, Observaciones, foto opcional, y fecha de detección (automática).
- **No toca la hoja principal** — es responsabilidad del área de Patrimonio formalizar el alta oficial después, con los datos contables completos.
- **Evita duplicados** → si escaneás un código que ya tiene un hallazgo cargado, la app abre esa misma ficha en vez de crear una nueva.
- **La primera foto crea el registro sola** → no hace falta tocar "Guardar" antes de poder sacar una foto — con lo que ya hayas tipeado hasta ese momento (aunque sea solo el código), la app guarda el hallazgo apenas subís la primera imagen.
- **Descartar un hallazgo a medio cargar** → si sacaste una foto pero cancelás sin llegar a guardar el resto de los datos, la app te pregunta si querés eliminar ese registro (la foto va a la papelera de Drive, recuperable ahí por un tiempo) o dejarlo así para completarlo después. A diferencia de los equipos de la hoja principal, en Altas pendientes sí existe esta opción de borrado — son registros preliminares, no patrimonio oficial.
- Se ve en una vista aparte, accesible con el botón **"📋 Altas pendientes"** (con contador) arriba de la lista, y también aparece mezclado en los resultados del buscador principal (con borde violeta) cuando coincide con lo que buscás.
- Tiene su propio botón de **informe PDF**, con los campos que sí tienen estos registros.

## Manual de usuario
Hay un manual para el equipo de trabajo en `manual.html`, accesible desde el botón **"📖 Manual"** en la barra de arriba de la app, o directo por URL agregando `/manual.html` a la dirección publicada (ej. `https://tu-sitio.netlify.app/manual.html`). No requiere login — se puede compartir el link solo, incluso a alguien que todavía no tiene acceso a la planilla.

Es un archivo autocontenido (imágenes incrustadas en base64), pensado para explicarle a la gente del equipo cómo usar la app en el día a día — no confundir con este README, que es para quien la instala/mantiene.

## Instalar la app
- **Android (Chrome):** aparece un botón **"⬇ Instalar app"** arriba a la derecha en cuanto el navegador detecta que se puede instalar. Un toque y queda como app en la pantalla de inicio, sin pasar por ninguna tienda.
- **iPhone (Safari):** Apple no permite disparar la instalación desde el código — hay que hacerlo a mano: Compartir 🔗 → "Agregar a pantalla de inicio". No hay forma de evitar ese paso manual en iOS.

## Si "Conectar con Google" no reacciona
Si el botón se queda pensando y no pasa nada, casi siempre es uno de estos tres (en este orden, de más a menos común):
1. **Falta agregar tu Gmail como "usuario de prueba"** en la Pantalla de consentimiento OAuth (paso 3 más arriba) — sin eso, Google corta el intento de conexión.
2. **Google Drive API no está activada** en el proyecto de Google Cloud (paso 3.2).
3. Algún bloqueo de red/extensión del navegador impidió cargar `apis.google.com` o `accounts.google.com` — probá en una ventana de incógnito o revisá la consola del navegador (F12 → pestaña Console) para ver el error puntual.

## Límites a tener en cuenta
- Sirve bien para uso de equipo (decenas de personas, cientos/pocos miles de equipos). Si el catálogo crece mucho (varios miles de filas), las búsquedas en el navegador empiezan a sentirse más lentas — en ese caso conviene pasar a una base de datos real.
- No funciona sin conexión a internet (siempre lee/escribe en vivo contra Google).
