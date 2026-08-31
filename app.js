// ============================================================
// Equipos INTI Rafaela — lógica de la app
// Usa Google Identity Services (OAuth) + Sheets API + Drive API
// ============================================================

const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email";

// Cada campo que la app gestiona se busca por el NOMBRE de su encabezado en
// la fila 1, no por una letra de columna fija — así no importa si alguien
// inserta columnas contables nuevas en el medio (pasó, y probablemente
// vuelva a pasar). Si algún encabezado no existe todavía (planilla nueva),
// la app lo crea sola al final.
const FIELD_HEADERS = {
  inventario: "N° inventario",
  estado: "Estado oblea",
  codigo: "Código Catálogo",
  categoria: "Descripción del catálogo",
  descripcion: "Descripción del bien",
  anio: "Año",
  proveedor: "Proveedor",
  responsablePatrimonial: "Responsable Patrimonial",
  modelo: "Modelo",
  serie: "Serie",
  ubicacion: "Ubicación",
  departamento: "Departamento",
  nuevoLugar: "Nuevo Lugar",
  estadoEquipo: "Estado de equipo o bien",
  codigoSGC: "Código SGC",
  observaciones: "Observaciones",
  photosFolderId: "Id_foto",
  ultimaModificacion: "Fecha modif",
  modificadoPor: "Agente_cambio",
  nombreCarpeta: "Nombre carpeta fotos",
  estadoVerificacion: "Estado relevamiento",
  fechaVerificacion: "Ultima edicion",
  verificadoPor: "Cambió",
  fotoPortadaId: "ID foto portada",
};
const LOCKED_FIELD_IDS = ["fInventario", "fEstado", "fCodigo", "fCategoria", "fDescripcion", "fModelo", "fSerie", "fUbicacion"];
const ESTADOS_VERIFICACION = ["Encontrado", "No encontrado"]; // "Pendiente" = celda vacía
const CONFIG_SHEET_NAME = "Config";
const ALTAS_SHEET_NAME = "Altas pendientes";
const ALTA_FIELD_HEADERS = {
  inventario: "N° inventario",
  descripcion: "Descripción del bien",
  modelo: "Modelo",
  serie: "Serie",
  departamento: "Departamento",
  nuevoLugar: "Nuevo Lugar",
  estadoEquipo: "Estado de equipo o bien",
  codigoSGC: "Código SGC",
  observaciones: "Observaciones",
  fechaDeteccion: "Fecha de detección",
  photosFolderId: "Id_foto",
  nombreCarpeta: "Nombre carpeta fotos",
};
let altaHeaderIndex = {};
let altaMaxCol = 1;
let altasPendientes = [];
let currentAltaRow = null;
let altaGalleryFiles = [];
let altaNoGuardado = false; // true si se creó el registro (por una foto) pero nunca se tocó "Guardar"
let altaFormDirty = false;
let equipoFormDirty = false;
let altasSheetNumericId = null;
const SESSION_MAX_DAYS = 5; // la sesión guardada expira sola después de tantos días sin usar la app

const DEPARTAMENTOS = [
  "10307-DT Metrologia Legal",
  "10328-DT Litoral Centro",
  "10538-Administracion Centro",
  "10623-AVyPS",
  "10625-TASIM",
  "10626-VEyC",
  "Lacteos",
];
const NUEVO_LUGAR_OPCIONES_DEFAULT = [
  "Sala 1", "Sala 2", "Sala 3", "Sala 4", "Sala 5", "Sala 6", "Sala 7", "Sala 8", "Sala 9", "Sala 10",
  "Sala 11", "Sala 12", "Sala 13", "Sala 14", "Sala 15", "Sala 16", "Sala 17",
  "Cocina", "Baño", "Comedor", "Galpon Sur", "Galpon Norte", "Vagón", "Patio", "Casillas UTN", "Sala de compresores",
];
let lugaresDinamicos = [...NUEVO_LUGAR_OPCIONES_DEFAULT]; // se reemplaza con lo leído/creado en Config
const ESTADO_EQUIPO_OPCIONES = ["En uso", "Fuera de uso", "Para dar de baja por rotura o obsolescencia"];

let tokenClient = null;
let accessToken = null;
let currentUserEmail = "";
let gapiReady = false;
let gisReady = false;
let sheetNumericId = null;
let headerIndex = {}; // fieldKey -> índice de columna (1-based), resuelto contra la fila 1
let maxKnownCol = 1;  // columna más a la derecha entre las que la app gestiona

let equipos = [];       // filas cargadas desde la planilla
let currentRow = null;  // n° de fila (1-based en la hoja) que se está editando; null = nuevo
let galleryFiles = [];  // fotos del equipo abierto en el panel de detalle

const $ = (id) => document.getElementById(id);

// ---------- Carga de las librerías de Google ----------

function gapiLoaded() {
  gapi.load("client", async () => {
    try {
      await gapi.client.init({});
      // Cargamos cada API por separado: si una falla, no tiene que tumbar a la otra.
      await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
      await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
      gapiReady = true;
      maybeInitTokenClient();
    } catch (err) {
      console.error("Error inicializando gapi.client:", err);
      showFatalError("No se pudieron cargar las APIs de Google (Sheets/Drive). Revisá tu conexión y volvé a intentar. Si persiste, fijate en la consola del navegador (F12) el detalle del error.");
    }
  });
}

function gisLoaded() {
  gisReady = true;
  maybeInitTokenClient();
}

function showFatalError(msg) {
  const hint = $("configHint");
  hint.textContent = msg;
  hint.style.color = "var(--rust)";
  showToast(msg, true);
}

function maybeInitTokenClient() {
  if (!gapiReady || !gisReady) return;
  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.startsWith("TU_")) {
    $("configHint").textContent = "Falta completar config.js con tus IDs (ver README.md).";
    return;
  }
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SCOPES,
      callback: onTokenReceived,
      error_callback: (err) => {
        console.error("Error de Google Identity Services:", err);
        showToast("Google rechazó la conexión: " + (err.type || err.message || "revisá la consola (F12)."), true);
      },
    });
  } catch (err) {
    console.error("initTokenClient falló:", err);
    showFatalError("No se pudo inicializar el login de Google. Revisá que CLIENT_ID en config.js sea correcto y que este dominio esté en 'Orígenes autorizados de JavaScript' (ver consola F12 para el detalle).");
    return;
  }
  // Reanudar sesión: el token guardado puede haber vencido del lado de
  // Google (dura ~1h), así que en vez de reusarlo a ciegas, pedimos uno
  // nuevo en silencio (sin popup, mientras el permiso siga vigente).
  const saved = localStorage.getItem("gtoken");
  const savedTs = parseInt(localStorage.getItem("gtoken_ts") || "0", 10);
  const vencida = !savedTs || (Date.now() - savedTs) > SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
  if (saved && !vencida) {
    currentUserEmail = localStorage.getItem("gemail") || "";
    tokenClient.requestAccessToken({ prompt: "" });
  } else if (saved && vencida) {
    // Sesión vieja: la limpiamos para que pida loguearse de nuevo.
    localStorage.removeItem("gtoken");
    localStorage.removeItem("gtoken_ts");
    localStorage.removeItem("gemail");
  }
}

// Diagnóstico: si a los 6 segundos todavía no está todo listo, decimos
// exactamente qué falta en vez de dejar el botón "pensando" sin explicación.
window.addEventListener("load", () => {
  setTimeout(() => {
    if (tokenClient) return; // ya está todo ok
    const faltantes = [];
    if (typeof gapi === "undefined") faltantes.push("la librería de Google APIs (apis.google.com) no cargó — revisá bloqueadores de anuncios/firewall de red");
    else if (!gapiReady) faltantes.push("gapi.client no terminó de inicializar (Sheets/Drive API)");
    if (typeof google === "undefined" || !google.accounts) faltantes.push("la librería de Google Identity (accounts.google.com/gsi) no cargó — revisá bloqueadores de anuncios/firewall de red");
    else if (!gisReady) faltantes.push("Google Identity no terminó de inicializar");
    if (CONFIG.CLIENT_ID && CONFIG.CLIENT_ID.startsWith("TU_")) faltantes.push("CLIENT_ID no está completado en config.js");
    if (faltantes.length) {
      showFatalError("No se pudo terminar de cargar la app. Motivo probable: " + faltantes.join("; ") + ".");
      console.warn("Diagnóstico de carga:", faltantes);
    }
  }, 6000);
});

function onTokenReceived(resp) {
  if (resp.error) {
    showToast("No se pudo conectar con Google: " + resp.error, true);
    return;
  }
  accessToken = resp.access_token;
  localStorage.setItem("gtoken", accessToken);
  localStorage.setItem("gtoken_ts", Date.now().toString());
  gapi.client.setToken({ access_token: accessToken });
  fetchUserEmail().finally(enterApp);
}

async function fetchUserEmail() {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (res.ok) {
      const info = await res.json();
      currentUserEmail = info.email || "";
      localStorage.setItem("gemail", currentUserEmail);
    }
  } catch (err) {
    console.error(err);
  }
}

function handleSignIn() {
  if (!tokenClient) {
    showToast("La app todavía no terminó de cargar — mirá el mensaje debajo del botón 'Conectar con Google' en la pantalla, ahí dice el motivo exacto.", true);
    return;
  }
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
}

function handleSignOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  currentUserEmail = "";
  localStorage.removeItem("gtoken");
  localStorage.removeItem("gtoken_ts");
  localStorage.removeItem("gemail");
  gapi.client.setToken(null);
  location.reload();
}

async function enterApp() {
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("btnSignIn").classList.add("hidden");
  $("btnSignOut").classList.remove("hidden");
  $("connDot").classList.add("online");
  try {
    await resolveSheetNumericId();
    await resolveColumnsFromHeaders();
    await resolveAltaColumns();
    await loadLugares();
    await loadEquipos();
    await loadAltasPendientes();
  } catch (err) {
    console.error(err);
    const code = err.status || (err.result && err.result.error && err.result.error.code);
    if (code === 403 || code === 404) {
      // Esta es la seguridad real de la app: si tu cuenta no tiene acceso a la
      // planilla/carpeta, Google directamente rechaza el pedido acá.
      $("app").classList.add("hidden");
      $("gate").classList.remove("hidden");
      $("btnSignIn").classList.add("hidden");
      $("btnSignOut").classList.remove("hidden");
      $("gate").querySelector(".gate-card h2").textContent = "Sin acceso";
      $("gate").querySelector(".gate-card p").textContent =
        `Tu cuenta (${currentUserEmail || "actual"}) inició sesión con Google, pero no tiene permiso sobre la planilla o la carpeta de Drive. Pedile a quien administra el Drive compartido que te agregue como colaborador con esa cuenta.`;
      $("btnSignInGate").textContent = "Salir y probar con otra cuenta";
      $("btnSignInGate").onclick = handleSignOut;
    } else {
      showToast("Error al conectar con la planilla. Revisá SPREADSHEET_ID / SHEET_NAME en config.js.", true);
    }
  }
}

async function resolveSheetNumericId() {
  const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: CONFIG.SPREADSHEET_ID });
  const sheet = res.result.sheets.find((s) => s.properties.title === CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("No se encontró la hoja " + CONFIG.SHEET_NAME);
  sheetNumericId = sheet.properties.sheetId;

  const configSheet = res.result.sheets.find((s) => s.properties.title === CONFIG_SHEET_NAME);
  if (!configSheet) {
    // Primera vez que se usa la app en esta planilla: creamos la pestaña
    // "Config" sola, con los lugares por defecto como semilla.
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: CONFIG_SHEET_NAME } } }] },
    });
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${CONFIG_SHEET_NAME}!A1:A${NUEVO_LUGAR_OPCIONES_DEFAULT.length + 1}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [["Nuevo Lugar"], ...NUEVO_LUGAR_OPCIONES_DEFAULT.map((v) => [v])] },
    });
  }

  const altasSheet = res.result.sheets.find((s) => s.properties.title === ALTAS_SHEET_NAME);
  if (!altasSheet) {
    // Ídem para "Altas pendientes" — se crea sola, sus encabezados los
    // termina de completar resolveColumnsForSheet() más abajo.
    const createRes = await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: { requests: [{ addSheet: { properties: { title: ALTAS_SHEET_NAME } } }] },
    });
    altasSheetNumericId = createRes.result.replies[0].addSheet.properties.sheetId;
  } else {
    altasSheetNumericId = altasSheet.properties.sheetId;
  }
}

// ---------- Columnas por nombre de encabezado (no por letra fija) ----------

function normalizeHeader(s) {
  return (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function colIndexToLetter(idx) {
  let s = "";
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

function letterOf(fieldKey) {
  return colIndexToLetter(headerIndex[fieldKey]);
}

// Lee la fila 1 de encabezados y ubica cada campo por nombre. Si algún
// encabezado que la app necesita no existe todavía, lo crea al final de la
// fila (así una planilla nueva se "autoconfigura" sola, sin pasos manuales).
// Función genérica: ubica (o crea) las columnas de cualquier pestaña según
// sus encabezados esperados. La usan tanto la hoja principal como Altas
// pendientes, cada una con su propio mapa de campos.
async function resolveColumnsForSheet(sheetName, fieldHeaders) {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${sheetName}!1:1`,
  });
  const headerRow = (res.result.values && res.result.values[0]) || [];
  const normalizedExisting = headerRow.map(normalizeHeader);

  const idx = {};
  const faltantes = [];
  Object.entries(fieldHeaders).forEach(([key, label]) => {
    const i = normalizedExisting.indexOf(normalizeHeader(label));
    if (i >= 0) idx[key] = i + 1;
    else faltantes.push(key);
  });

  if (faltantes.length) {
    let nextCol = headerRow.length + 1;
    const nuevosEncabezados = [];
    faltantes.forEach((key) => {
      idx[key] = nextCol;
      nuevosEncabezados.push(fieldHeaders[key]);
      nextCol++;
    });
    const desde = colIndexToLetter(headerRow.length + 1);
    const hasta = colIndexToLetter(nextCol - 1);
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${sheetName}!${desde}1:${hasta}1`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [nuevosEncabezados] },
    });
  }

  return { idx, maxCol: Math.max(...Object.values(idx)) };
}

async function resolveColumnsFromHeaders() {
  const r = await resolveColumnsForSheet(CONFIG.SHEET_NAME, FIELD_HEADERS);
  headerIndex = r.idx;
  maxKnownCol = r.maxCol;
}

async function resolveAltaColumns() {
  const r = await resolveColumnsForSheet(ALTAS_SHEET_NAME, ALTA_FIELD_HEADERS);
  altaHeaderIndex = r.idx;
  altaMaxCol = r.maxCol;
}

async function loadLugares() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${CONFIG_SHEET_NAME}!A2:A1000`,
    });
    const rows = (res.result.values || []).map((r) => (r[0] || "").trim()).filter(Boolean);
    lugaresDinamicos = rows.length ? rows : [...NUEVO_LUGAR_OPCIONES_DEFAULT];
  } catch (err) {
    console.error(err);
    lugaresDinamicos = [...NUEVO_LUGAR_OPCIONES_DEFAULT];
  }
  buildSelectWithOtro($("fNuevoLugar"), lugaresDinamicos, "(sin definir)", false);
  buildSelectWithOtro($("faNuevoLugar"), lugaresDinamicos, "(sin definir)", false);
}

// ---------- Cargar equipos desde la planilla ----------

async function loadEquipos() {
  $("loadingMsg").classList.remove("hidden");
  $("cardsGrid").innerHTML = "";
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${CONFIG.SHEET_NAME}!A2:${colIndexToLetter(maxKnownCol)}`,
  });
  const rows = res.result.values || [];
  equipos = rows.map((r, i) => rowToEquipo(r, i + 2)).filter((e) => e.inventario || e.descripcion);
  $("loadingMsg").classList.add("hidden");
  populateFilterOptions();
  renderList();
}

function rowToEquipo(row, rowNumber) {
  const e = { rowNumber };
  Object.keys(FIELD_HEADERS).forEach((key) => {
    e[key] = row[headerIndex[key] - 1] || "";
  });
  return e;
}

// Escribe SOLO las columnas que la app gestiona, cada una en su celda
// puntual (no un bloque contiguo) — así nunca pisa las columnas contables
// que puedan estar intercaladas en el medio.
// Si un texto empieza con =, +, - o @, Google Sheets lo interpretaría como
// una fórmula en vez de texto literal. Anteponerle una comilla simple lo
// fuerza a tratarse como texto — el usuario ve exactamente lo que escribió.
function sanitizeCellText(value) {
  const v = value === undefined || value === null ? "" : value.toString();
  if (/^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

async function writeEquipoFields(rowNumber, data) {
  const entradas = Object.keys(data).filter((k) => headerIndex[k]);
  if (entradas.length === 0) return;
  const requestData = entradas.map((key) => ({
    range: `${CONFIG.SHEET_NAME}!${letterOf(key)}${rowNumber}`,
    values: [[sanitizeCellText(data[key])]],
  }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    resource: { valueInputOption: "USER_ENTERED", data: requestData },
  });
}

// ---------- Altas pendientes (hallazgos sin N° de inventario oficial) ----------

async function loadAltasPendientes() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${ALTAS_SHEET_NAME}!A2:${colIndexToLetter(altaMaxCol)}`,
  });
  const rows = res.result.values || [];
  altasPendientes = rows
    .map((r, i) => {
      const a = { rowNumber: i + 2 };
      Object.keys(ALTA_FIELD_HEADERS).forEach((key) => { a[key] = r[altaHeaderIndex[key] - 1] || ""; });
      return a;
    })
    .filter((a) => a.inventario || a.descripcion);
  $("btnAltas").textContent = `📋 Altas pendientes (${altasPendientes.length})`;
}

async function writeAltaFields(rowNumber, data) {
  const entradas = Object.keys(data).filter((k) => altaHeaderIndex[k]);
  if (entradas.length === 0) return;
  const requestData = entradas.map((key) => ({
    range: `${ALTAS_SHEET_NAME}!${colIndexToLetter(altaHeaderIndex[key])}${rowNumber}`,
    values: [[sanitizeCellText(data[key])]],
  }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    resource: { valueInputOption: "USER_ENTERED", data: requestData },
  });
}

async function appendAltaPendiente(data) {
  const anchorKey = altaHeaderIndex.descripcion ? "descripcion" : "inventario";
  const anchorCol = colIndexToLetter(altaHeaderIndex[anchorKey]);
  const anchorVal = data[anchorKey] || " ";
  const appendRes = await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${ALTAS_SHEET_NAME}!${anchorCol}2:${anchorCol}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [[sanitizeCellText(anchorVal)]] },
  });
  const range = appendRes.result.updates.updatedRange;
  const match = range.match(/[A-Z]+(\d+)/);
  if (!match) throw new Error("No se pudo determinar la fila nueva.");
  const rowNumber = parseInt(match[1], 10);
  await writeAltaFields(rowNumber, data);
  return rowNumber;
}

function collectAltaFormData() {
  return {
    inventario: $("faInventario").value.trim(),
    descripcion: $("faDescripcion").value.trim(),
    modelo: $("faModelo").value.trim(),
    serie: $("faSerie").value.trim(),
    departamento: resolveSelectWithOtro($("faDepartamento"), $("faDepartamentoOtro")),
    nuevoLugar: $("faNuevoLugar").value,
    estadoEquipo: $("faEstadoEquipo").value,
    codigoSGC: $("faCodigoSGC").value.trim(),
    observaciones: $("faObservaciones").value.trim(),
  };
}

// Descarta un hallazgo que se llegó a crear (por una foto) pero nunca se
// guardó del todo: manda la carpeta de fotos a la papelera de Drive
// (recuperable ahí, no se borra de una) y elimina la fila de la planilla.
async function discardAlta() {
  const a = altasPendientes.find((x) => x.rowNumber === currentAltaRow);
  if (a && a.photosFolderId) {
    try {
      await gapi.client.drive.files.update({
        fileId: a.photosFolderId,
        resource: { trashed: true },
        supportsAllDrives: true,
      });
    } catch (err) {
      console.error(err);
    }
  }
  try {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: altasSheetNumericId,
              dimension: "ROWS",
              startIndex: currentAltaRow - 1,
              endIndex: currentAltaRow,
            },
          },
        }],
      },
    });
    showToast("Hallazgo descartado.");
  } catch (err) {
    console.error(err);
    showToast("No se pudo eliminar del todo — revisalo en la planilla.", true);
  }
  await loadAltasPendientes();
}

async function ensureAltaPhotosFolder(alta) {
  if (alta.photosFolderId) return alta.photosFolderId;
  const inv = (alta.inventario || "S/D").trim() || "S/D";
  const lugar = sanitizeForFolderName(alta.nuevoLugar) || "sin-lugar";
  const label = `${inv} - ${lugar} (pendiente)`;
  const lugarFolderId = await ensureLugarFolder(lugar);
  const createRes = await gapi.client.drive.files.create({
    resource: { name: label, mimeType: "application/vnd.google-apps.folder", parents: [lugarFolderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const folderId = createRes.result.id;
  await writeAltaFields(alta.rowNumber, { photosFolderId: folderId, nombreCarpeta: label });
  alta.photosFolderId = folderId;
  alta.nombreCarpeta = label;
  return folderId;
}

// ---------- UI de Altas pendientes ----------

function openAltasListView() {
  renderAltasGrid();
  $("altasListView").classList.remove("hidden");
  pushHistoryLayer();
}

function hideAltasListUI() {
  $("altasListView").classList.add("hidden");
}

function closeAltasListView() {
  if (!$("altasListView").classList.contains("hidden")) history.back();
  else hideAltasListUI();
}

function renderAltasGrid() {
  const grid = $("altasCardsGrid");
  grid.innerHTML = "";
  $("altasEmptyState").classList.toggle("hidden", altasPendientes.length > 0);
  altasPendientes.forEach((a) => grid.appendChild(buildAltaCard(a)));
}

function buildAltaCard(a, inSearch) {
  const card = document.createElement("div");
  card.className = "equip-card alta-pending-card";
  const lugar = a.nuevoLugar || "sin lugar";
  card.innerHTML = `
    ${inSearch ? `<span class="alta-badge">📋 Hallazgo pendiente</span>` : ""}
    <div class="equip-card-top">
      <span class="equip-line1">${escapeHtml(a.inventario || "S/D")}${a.fechaDeteccion ? " · " + escapeHtml(a.fechaDeteccion) : ""}</span>
    </div>
    <div class="equip-desc">${escapeHtml(a.descripcion || "(sin descripción)")}</div>
    <div class="equip-meta">${escapeHtml(a.modelo || "S/D")} · ${escapeHtml(a.serie || "S/D")}</div>
    <div class="equip-meta">${escapeHtml(a.departamento || "sin depto.")} · ${escapeHtml(lugar)}</div>
  `;
  card.addEventListener("click", () => openAltaPanel(null, a.rowNumber));
  return card;
}

function openAltaPanel(prefillInventario, rowNumber) {
  currentAltaRow = rowNumber || null;
  altaNoGuardado = false;
  const a = rowNumber ? altasPendientes.find((x) => x.rowNumber === rowNumber) : null;
  $("altaTitle").textContent = a ? (a.inventario || "Hallazgo") : "Nuevo hallazgo";
  $("faInventario").value = a ? a.inventario : (prefillInventario || "");
  $("faDescripcion").value = a ? a.descripcion : "";
  $("faModelo").value = a ? a.modelo : "";
  $("faSerie").value = a ? a.serie : "";
  $("faCodigoSGC").value = a ? a.codigoSGC : "";
  $("faObservaciones").value = a ? a.observaciones : "";
  setSelectWithOtro($("faDepartamento"), $("wrapFaDepartamentoOtro"), $("faDepartamentoOtro"), DEPARTAMENTOS, a ? a.departamento : "");
  setSelectWithOtro($("faNuevoLugar"), $("wrapNuevoLugarOtro"), $("fNuevoLugarOtro"), lugaresDinamicos, a ? a.nuevoLugar : "");
  setSelectWithOtro($("faEstadoEquipo"), $("wrapEstadoEquipoOtro"), $("fEstadoEquipoOtro"), ESTADO_EQUIPO_OPCIONES, a ? a.estadoEquipo : "");

  altaGalleryFiles = [];
  if (a && a.photosFolderId) {
    loadAltaGallery(a.photosFolderId);
  } else {
    $("altaGallery").innerHTML = "";
    $("altaGalleryEmpty").textContent = a ? "Todavía no hay fotos." : "Sacá una foto o guardá el hallazgo para poder subir fotos.";
    $("altaGalleryEmpty").classList.remove("hidden");
  }

  $("overlayAlta").classList.remove("hidden");
  $("altaPanel").classList.remove("hidden");
  pushHistoryLayer();
  altaFormDirty = false;
}

function hideAltaPanelUI() {
  $("overlayAlta").classList.add("hidden");
  $("altaPanel").classList.add("hidden");
  currentAltaRow = null;
  altaNoGuardado = false;
  altaFormDirty = false;
}

function closeAltaPanel() {
  if (!$("altaPanel").classList.contains("hidden")) history.back();
  else hideAltaPanelUI();
}

async function saveAlta() {
  const data = collectAltaFormData();
  $("btnSaveAlta").disabled = true;
  try {
    if (currentAltaRow) {
      await writeAltaFields(currentAltaRow, data);
      showToast("Hallazgo guardado.");
    } else {
      data.fechaDeteccion = formatTimestamp(new Date());
      currentAltaRow = await appendAltaPendiente(data);
      showToast("Hallazgo guardado.");
    }
    altaNoGuardado = false;
    altaFormDirty = false;
    closeAltaPanel();
    await loadAltasPendientes();
  } catch (err) {
    console.error(err);
    showToast("No se pudo guardar el hallazgo.", true);
  } finally {
    $("btnSaveAlta").disabled = false;
  }
}

async function loadAltaGallery(folderId) {
  $("altaGallery").innerHTML = "";
  altaGalleryFiles = [];
  if (!folderId) {
    $("altaGalleryEmpty").textContent = "Todavía no hay fotos.";
    $("altaGalleryEmpty").classList.remove("hidden");
    return;
  }
  $("altaGalleryEmpty").classList.add("hidden");
  try {
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id, name, webViewLink)",
      orderBy: "createdTime",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      pageSize: 100,
    });
    altaGalleryFiles = res.result.files || [];
    if (altaGalleryFiles.length === 0) {
      $("altaGalleryEmpty").textContent = "Todavía no hay fotos.";
      $("altaGalleryEmpty").classList.remove("hidden");
    }
    renderAltaGallery();
  } catch (err) {
    console.error(err);
    showToast("No se pudieron cargar las fotos.", true);
  }
}

function renderAltaGallery() {
  const gal = $("altaGallery");
  gal.innerHTML = "";
  altaGalleryFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.innerHTML = `<img alt="${escapeHtml(file.name)}"><button class="gallery-del" title="Eliminar foto">✕</button>`;
    gal.appendChild(item);
    const img = item.querySelector("img");
    const delBtn = item.querySelector(".gallery-del");
    delBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("¿Eliminar esta foto?")) return;
      try {
        await gapi.client.drive.files.delete({ fileId: file.id, supportsAllDrives: true });
        item.remove();
        altaGalleryFiles = altaGalleryFiles.filter((f) => f.id !== file.id);
        if (altaGalleryFiles.length === 0) $("altaGalleryEmpty").classList.remove("hidden");
      } catch (err) {
        console.error(err);
        showToast("No se pudo eliminar la foto.", true);
      }
    });
    img.addEventListener("click", () => openLightbox(img.src, file));
    fetchDriveImage(file.id).then((url) => { if (url) img.src = url; });
  });
}

async function handleAltaPhotoUpload(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  $("altaUploadStatus").classList.remove("hidden");
  try {
    let a;
    if (!currentAltaRow) {
      // Todavía no existe el registro: la primera foto lo crea sola, con
      // lo que ya haya cargado en el formulario hasta este momento — para
      // no obligar a tocar "Guardar" antes de poder sacar la foto.
      $("altaUploadStatus").textContent = "Guardando el hallazgo…";
      const data = collectAltaFormData();
      data.fechaDeteccion = formatTimestamp(new Date());
      currentAltaRow = await appendAltaPendiente(data);
      altaNoGuardado = true;
      $("altaTitle").textContent = data.inventario || "Hallazgo";
      a = { rowNumber: currentAltaRow, inventario: data.inventario, nuevoLugar: data.nuevoLugar, photosFolderId: "" };
    } else {
      a = altasPendientes.find((x) => x.rowNumber === currentAltaRow) ||
        { rowNumber: currentAltaRow, inventario: $("faInventario").value, nuevoLugar: $("faNuevoLugar").value, photosFolderId: "" };
    }
    const folderId = await ensureAltaPhotosFolder(a);
    for (let i = 0; i < files.length; i++) {
      $("altaUploadStatus").textContent = `Comprimiendo foto ${i + 1} de ${files.length}…`;
      const compressed = await compressImage(files[i]);
      $("altaUploadStatus").textContent = `Subiendo foto ${i + 1} de ${files.length}…`;
      await uploadOnePhoto(compressed, files[i].name, folderId);
    }
    showToast("Fotos subidas.");
    await loadAltaGallery(folderId);
    await loadAltasPendientes();
  } catch (err) {
    console.error(err);
    showToast("Error al subir la foto.", true);
  } finally {
    $("altaUploadStatus").classList.add("hidden");
    $("faPhotoInput").value = "";
  }
}

// ---------- Informe PDF de Altas pendientes ----------

async function generatePdfReportAltas() {
  if (altasPendientes.length === 0) {
    showToast("No hay altas pendientes para incluir en el informe.", true);
    return;
  }
  const btn = $("btnReportAltas");
  btn.disabled = true;
  let completed = 0;
  btn.textContent = `📄 Cargando fotos 0/${altasPendientes.length}…`;

  const items = await mapWithConcurrency(altasPendientes, 6, async (a) => {
    let photoUrl = null;
    try {
      if (a.photosFolderId) {
        const res = await gapi.client.drive.files.list({
          q: `'${a.photosFolderId}' in parents and mimeType contains 'image/' and trashed = false`,
          fields: "files(id)",
          orderBy: "createdTime",
          pageSize: 1,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: "allDrives",
        });
        const files = res.result.files || [];
        if (files.length) photoUrl = await fetchDriveImageCached(files[0].id);
      }
    } catch (err) {
      console.error(err);
    }
    completed++;
    btn.textContent = `📄 Cargando fotos ${completed}/${altasPendientes.length}…`;
    return { a, photoUrl };
  });

  btn.textContent = "📄 Informe";
  btn.disabled = false;

  renderPrintReportAltas(items);
  await waitForImages($("printReport"));
  window.print();
}

function renderPrintReportAltas(items) {
  const fecha = new Date().toLocaleDateString("es-AR");
  const perPage = 16;
  const totalPages = Math.ceil(items.length / perPage);
  let html = "";

  for (let p = 0; p < totalPages; p++) {
    const chunk = items.slice(p * perPage, p * perPage + perPage);
    html += `<div class="report-page">
      <div class="report-header">
        <div>
          <div class="report-title">Informe de altas pendientes</div>
          <div class="report-sub">INTI Rafaela · Hallazgos sin alta patrimonial oficial</div>
        </div>
        <div class="report-date">${fecha} · Pág. ${p + 1}/${totalPages}</div>
      </div>
      <div class="report-grid">`;

    chunk.forEach(({ a, photoUrl }) => {
      html += `<div class="report-card pending">
        <div class="report-photo">${photoUrl ? `<img src="${photoUrl}">` : "sin foto"}</div>
        <div class="report-info">
          <div class="report-row-top">
            <span class="report-code">${escapeHtml(a.inventario || "S/D")}</span>
            <span class="report-verif pending">${escapeHtml(a.fechaDeteccion || "")}</span>
          </div>
          <div class="report-desc">${escapeHtml(a.descripcion || "(sin descripción)")}</div>
          <div class="report-meta">${escapeHtml(a.modelo || "S/D")} · ${escapeHtml(a.serie || "S/D")}</div>
          <div class="report-meta">${escapeHtml(a.departamento || "sin depto.")} · ${escapeHtml(a.nuevoLugar || "sin lugar")}</div>
        </div>
      </div>`;
    });

    html += `</div>
      <div class="report-footer">${items.length} altas pendientes</div>
    </div>`;
  }

  $("printReport").innerHTML = html;
}

// ---------- Filtros ----------

function populateFilterOptions() {
  fillSelect("filterUbicacion", uniqueSorted(equipos.map((e) => e.ubicacion)));
  fillSelect("filterCategoria", uniqueSorted(equipos.map((e) => e.categoria)));
  fillSelect("filterDepartamento", uniqueSorted(equipos.map((e) => e.departamento)));
  fillSelect("filterNuevoLugar", uniqueSorted(equipos.map((e) => e.nuevoLugar)));
  fillSelect("filterEstadoEquipo", uniqueSorted(equipos.map((e) => e.estadoEquipo)));
  fillDatalist("dlUbicaciones", uniqueSorted(equipos.map((e) => e.ubicacion)));
  fillDatalist("dlCategorias", uniqueSorted(equipos.map((e) => e.categoria)));
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function fillSelect(id, values) {
  const sel = $(id);
  const current = sel.value;
  sel.innerHTML = sel.options[0].outerHTML;
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
  if (values.includes(current)) sel.value = current;
}

function fillDatalist(id, values) {
  const dl = $(id);
  dl.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}">`).join("");
}

// ---------- Selects con opción "Otro" (Nuevo Lugar / Estado de equipo) ----------

function buildSelectWithOtro(selectEl, fixedOptions, placeholder, includeOtro = true) {
  selectEl.innerHTML =
    `<option value="">${escapeHtml(placeholder)}</option>` +
    fixedOptions.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("") +
    (includeOtro ? `<option value="Otro">Otro</option>` : "");
}

function setSelectWithOtro(selectEl, otroWrapEl, otroInputEl, fixedOptions, storedValue) {
  const val = storedValue || "";
  if (val === "" || fixedOptions.includes(val)) {
    selectEl.value = val;
    otroWrapEl.classList.add("hidden");
    otroInputEl.value = "";
    return;
  }
  const tieneOpcionOtro = Array.from(selectEl.options).some((o) => o.value === "Otro");
  if (tieneOpcionOtro) {
    selectEl.value = "Otro";
    otroWrapEl.classList.remove("hidden");
    otroInputEl.value = val;
    return;
  }
  // No hay "Otro" en este select (ej. Nuevo Lugar): mostramos el valor ya
  // guardado como una opción propia, para no perderlo de vista aunque no
  // esté en la lista fija (quedó cargado antes de sacar la opción "Otro").
  let opt = Array.from(selectEl.options).find((o) => o.value === val);
  if (!opt) {
    opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    selectEl.appendChild(opt);
  }
  selectEl.value = val;
  otroWrapEl.classList.add("hidden");
  otroInputEl.value = "";
}

function resolveSelectWithOtro(selectEl, otroInputEl) {
  if (selectEl.value === "Otro") return otroInputEl.value.trim();
  return selectEl.value;
}

async function addNuevoLugarOption() {
  const actual = $("fNuevoLugar").value;
  const prefill = actual && !lugaresDinamicos.includes(actual) ? actual : "";
  const nombre = prompt("Nombre del lugar nuevo:", prefill);
  if (nombre === null) return; // canceló
  const valor = nombre.trim();
  if (!valor) return;

  if (!lugaresDinamicos.includes(valor)) {
    try {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${CONFIG_SHEET_NAME}!A:A`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: { values: [[sanitizeCellText(valor)]] },
      });
      lugaresDinamicos.push(valor);
      showToast("Lugar agregado a la lista.");
    } catch (err) {
      console.error(err);
      showToast("No se pudo agregar el lugar nuevo.", true);
      return;
    }
  }

  buildSelectWithOtro($("fNuevoLugar"), lugaresDinamicos, "(sin definir)", false);
  $("fNuevoLugar").value = valor;
  $("wrapNuevoLugarOtro").classList.add("hidden");
  populateFilterOptions();
}

// ---------- Render de la lista ----------

let currentFilteredEquipos = []; // último resultado de renderList(), reusado por el informe PDF

function getActiveFilters() {
  return {
    ubic: $("filterUbicacion").value,
    cat: $("filterCategoria").value,
    estado: $("filterEstado").value,
    depto: $("filterDepartamento").value,
    lugar: $("filterNuevoLugar").value,
    estadoEquipo: $("filterEstadoEquipo").value,
    verif: $("filterVerificacion").value,
    q: $("searchInput").value.trim().toLowerCase(),
  };
}

function filterEquipos(f) {
  return equipos.filter((e) => {
    if (f.ubic && e.ubicacion !== f.ubic) return false;
    if (f.cat && e.categoria !== f.cat) return false;
    if (f.estado && e.estado !== f.estado) return false;
    if (f.depto && e.departamento !== f.depto) return false;
    if (f.lugar && e.nuevoLugar !== f.lugar) return false;
    if (f.estadoEquipo && e.estadoEquipo !== f.estadoEquipo) return false;
    if (f.verif) {
      const v = e.estadoVerificacion || "Pendiente";
      if (v !== f.verif) return false;
    }
    if (f.q) {
      const hay = `${e.inventario} ${e.codigo} ${e.descripcion} ${e.modelo} ${e.serie}`.toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  });
}

function renderList() {
  const filtered = filterEquipos(getActiveFilters());
  currentFilteredEquipos = filtered;

  $("resultCount").textContent = `${filtered.length} equipo${filtered.length === 1 ? "" : "s"}`;
  updateProgressCounter();
  const grid = $("cardsGrid");
  grid.innerHTML = "";
  filtered.forEach((e) => grid.appendChild(buildCard(e)));

  // Si hay texto de búsqueda, sumamos también coincidencias de Altas
  // pendientes al final — con otro color, para no confundirlas con
  // equipos ya registrados.
  const q = $("searchInput").value.trim().toLowerCase();
  let altaMatches = [];
  if (q) {
    altaMatches = altasPendientes.filter((a) => {
      const hay = `${a.inventario} ${a.descripcion} ${a.modelo} ${a.serie}`.toLowerCase();
      return hay.includes(q);
    });
    altaMatches.forEach((a) => grid.appendChild(buildAltaCard(a, true)));
  }

  $("emptyState").classList.toggle("hidden", filtered.length > 0 || altaMatches.length > 0);
}

function updateProgressCounter() {
  const total = equipos.length;
  if (total === 0) { $("progressCounter").classList.add("hidden"); return; }
  const encontrados = equipos.filter((e) => e.estadoVerificacion === "Encontrado").length;
  const noEncontrados = equipos.filter((e) => e.estadoVerificacion === "No encontrado").length;
  const revisados = encontrados + noEncontrados;
  $("progressCounter").textContent =
    `Relevamiento: ${revisados}/${total} revisados` + (noEncontrados ? ` · ${noEncontrados} no encontrado${noEncontrados === 1 ? "" : "s"}` : "");
  $("progressCounter").classList.remove("hidden");
}

function hasInventario(inv) {
  const v = (inv || "").trim().toUpperCase();
  return v !== "" && v !== "S/D" && v !== "SD" && v !== "S/N";
}

function displayCode(e) {
  return (e.inventario && e.inventario.trim()) || "S/D";
}

function sanitizeForFolderName(text) {
  return (text || "").replace(/[\/\\]/g, "-").trim().slice(0, 40);
}

function statusClass(estado) {
  return "status-" + (estado || "").replace(/\s+/g, "-");
}

function verifClass(v) {
  if (v === "Encontrado") return "verif-ok";
  if (v === "No encontrado") return "verif-missing";
  return "verif-pending";
}

function buildCard(e) {
  const card = document.createElement("div");
  const v = e.estadoVerificacion || "";
  card.className = "equip-card " + verifClass(v);
  const lugar = e.nuevoLugar || e.ubicacion || "sin lugar";
  const linea1 = [displayCode(e), e.anio, e.estadoEquipo].filter(Boolean).map(escapeHtml).join(" · ");
  card.innerHTML = `
    <div class="equip-card-top">
      <span class="equip-line1">${linea1}</span>
      <span class="equip-status ${statusClass(e.estado)}" title="${escapeHtml(e.estado)}"></span>
    </div>
    <div class="equip-desc">${escapeHtml(e.descripcion || "(sin descripción)")}</div>
    <div class="equip-meta">${escapeHtml(e.categoria || "sin categoría")} · ${escapeHtml(e.modelo || "S/D")} · ${escapeHtml(e.serie || "S/D")}</div>
    <div class="equip-meta equip-row4">
      <span>${escapeHtml(e.departamento || "sin depto.")} · ${escapeHtml(lugar)}</span>
      ${e.photosFolderId ? `<span class="equip-cam">📷</span>` : ""}
    </div>
    ${v ? `<span class="verif-tag">${v === "Encontrado" ? "✓ Encontrado" : "✕ No encontrado"}</span>` : ""}
  `;
  card.addEventListener("click", () => openDetail(e.rowNumber));
  return card;
}

async function quickVerify(rowNumber, nuevoEstado) {
  const e = equipos.find((x) => x.rowNumber === rowNumber);
  if (!e) return;
  const yaEstaba = e.estadoVerificacion === nuevoEstado;
  const valor = yaEstaba ? "" : nuevoEstado; // tocar el mismo botón de nuevo vuelve a "Pendiente"
  const fecha = valor ? formatTimestamp(new Date()) : "";
  const quien = valor ? (currentUserEmail || "desconocido") : "";
  try {
    await writeEquipoFields(rowNumber, {
      estadoVerificacion: valor,
      fechaVerificacion: fecha,
      verificadoPor: quien,
    });
    e.estadoVerificacion = valor;
    e.fechaVerificacion = fecha;
    e.verificadoPor = quien;
    renderList();
    if (currentRow === rowNumber) updateVerifUI(e);
  } catch (err) {
    console.error(err);
    showToast("No se pudo actualizar la verificación.", true);
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Panel de detalle ----------

function setFieldsLocked(locked) {
  const group = $("groupAH");
  group.classList.toggle("locked", locked);
  LOCKED_FIELD_IDS.forEach((id) => { $(id).disabled = locked; });
  $("lockNotice").classList.toggle("hidden", !locked);
}

function openDetail(rowNumber) {
  currentRow = rowNumber;
  const e = equipos.find((x) => x.rowNumber === rowNumber);
  fillForm(e);
  setFieldsLocked(true);
  $("detailTitle").textContent = displayCode(e);
  $("detailDot").className = "tag-dot " + (e.estado === "Pegado" ? "online" : "");
  showDetailPanel();
  loadGallery(e.photosFolderId);
  equipoFormDirty = false;
}

function fillForm(e) {
  $("fInventario").value = e ? e.inventario : "";
  $("fEstado").value = e ? (e.estado || "Pendiente de pegado") : "Pendiente de pegado";
  $("fCodigo").value = e ? e.codigo : "";
  $("fCategoria").value = e ? e.categoria : "";
  $("fDescripcion").value = e ? e.descripcion : "";
  $("fModelo").value = e ? e.modelo : "";
  $("fSerie").value = e ? e.serie : "";
  $("fUbicacion").value = e ? e.ubicacion : "";
  setSelectWithOtro($("fDepartamento"), $("wrapDepartamentoOtro"), $("fDepartamentoOtro"), DEPARTAMENTOS, e ? e.departamento : "");
  $("fCodigoSGC").value = e ? e.codigoSGC : "";
  $("fObservaciones").value = e ? e.observaciones : "";

  setSelectWithOtro($("fNuevoLugar"), $("wrapNuevoLugarOtro"), $("fNuevoLugarOtro"), lugaresDinamicos, e ? e.nuevoLugar : "");
  setSelectWithOtro($("fEstadoEquipo"), $("wrapEstadoEquipoOtro"), $("fEstadoEquipoOtro"), ESTADO_EQUIPO_OPCIONES, e ? e.estadoEquipo : "");

  const audit = $("auditInfo");
  if (e && e.ultimaModificacion) {
    audit.textContent = `Última modificación: ${e.ultimaModificacion} · por ${e.modificadoPor || "?"}`;
    audit.classList.remove("hidden");
  } else {
    audit.classList.add("hidden");
  }

  const patrimonio = $("patrimonioInfo");
  const datosPatrimonio = e && e.anio;
  if (datosPatrimonio) {
    patrimonio.textContent = `Año de alta: ${e.anio}`;
    patrimonio.classList.remove("hidden");
  } else {
    patrimonio.classList.add("hidden");
  }
  $("fResponsablePatrimonial").value = e ? e.responsablePatrimonial : "";
  $("fProveedor").value = e ? e.proveedor : "";

  updateVerifUI(e);
}

function updateVerifUI(e) {
  const v = e ? (e.estadoVerificacion || "") : "";
  $("btnVerifOk").classList.toggle("active", v === "Encontrado");
  $("btnVerifMissing").classList.toggle("active", v === "No encontrado");
  const canVerify = !!e; // solo si el equipo ya está guardado (tiene fila)
  $("btnVerifOk").disabled = !canVerify;
  $("btnVerifMissing").disabled = !canVerify;

  const info = $("verifInfo");
  if (e && e.fechaVerificacion) {
    info.textContent = `${v}: ${e.fechaVerificacion} · por ${e.verificadoPor || "?"}`;
    info.classList.remove("hidden");
  } else {
    info.classList.add("hidden");
  }
}

// ---------- Historial / botón "atrás" ----------
// Cada capa que se abre (ficha, foto ampliada) agrega un paso al historial,
// para que "atrás" cierre una capa a la vez en vez de salir de la app.
// Cuando no queda nada abierto, "atrás" pregunta antes de salir de verdad.

function pushHistoryLayer() {
  history.pushState({ equiposLayer: true }, "");
}

function hideDetailPanelUI() {
  $("overlay").classList.add("hidden");
  $("detailPanel").classList.add("hidden");
  currentRow = null;
}

function hideLightboxUI() {
  $("lightbox").classList.add("hidden");
  $("lightboxImg").src = "";
}

window.addEventListener("popstate", () => {
  const scannerOpen = !$("scannerOverlay").classList.contains("hidden");
  const lightboxOpen = !$("lightbox").classList.contains("hidden");
  const detailOpen = !$("detailPanel").classList.contains("hidden");
  const altaOpen = $("altaPanel") && !$("altaPanel").classList.contains("hidden");
  const altasListOpen = $("altasListView") && !$("altasListView").classList.contains("hidden");

  if (scannerOpen) {
    hideScannerUI();
    return;
  }
  if (lightboxOpen) {
    hideLightboxUI();
    return;
  }
  if (altaOpen) {
    if (altaNoGuardado) {
      // Se sacó una foto (creó el registro) pero nunca se tocó "Guardar".
      if (confirm('Sacaste una foto pero no guardaste los datos del hallazgo.\n\nAceptar = eliminar este registro y sus fotos.\nCancelar = dejarlo así, lo completás después.')) {
        discardAlta();
      }
      hideAltaPanelUI();
      return;
    }
    if (altaFormDirty && !confirm("Tenés cambios sin guardar en este hallazgo. ¿Salir igual?")) {
      pushHistoryLayer(); // se arrepintió: lo "atrapamos" con el panel abierto
      return;
    }
    hideAltaPanelUI();
    return;
  }
  if (detailOpen) {
    if (equipoFormDirty && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) {
      pushHistoryLayer();
      return;
    }
    hideDetailPanelUI();
    return;
  }
  if (altasListOpen) {
    hideAltasListUI();
    return;
  }
  // No había nada abierto: el usuario está tratando de salir de la app.
  if (confirm("¿Seguro que querés salir de la app?")) {
    return; // se deja ir, el navegador ya se movió hacia atrás
  }
  pushHistoryLayer(); // se arrepintió: lo "atrapamos" en el mismo lugar
});

function showDetailPanel() {
  $("overlay").classList.remove("hidden");
  $("detailPanel").classList.remove("hidden");
  pushHistoryLayer();
}

function closeDetailPanel() {
  if (!$("detailPanel").classList.contains("hidden")) history.back();
  else hideDetailPanelUI();
}

function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formToEquipo() {
  return {
    inventario: $("fInventario").value.trim(),
    estado: $("fEstado").value,
    codigo: $("fCodigo").value.trim(),
    categoria: $("fCategoria").value.trim(),
    descripcion: $("fDescripcion").value.trim(),
    modelo: $("fModelo").value.trim(),
    serie: $("fSerie").value.trim(),
    ubicacion: $("fUbicacion").value.trim(),
    departamento: resolveSelectWithOtro($("fDepartamento"), $("fDepartamentoOtro")),
    nuevoLugar: resolveSelectWithOtro($("fNuevoLugar"), $("fNuevoLugarOtro")),
    estadoEquipo: resolveSelectWithOtro($("fEstadoEquipo"), $("fEstadoEquipoOtro")),
    codigoSGC: $("fCodigoSGC").value.trim(),
    observaciones: $("fObservaciones").value.trim(),
  };
}

async function saveEquipo() {
  const data = formToEquipo();
  data.ultimaModificacion = formatTimestamp(new Date());
  data.modificadoPor = currentUserEmail || "desconocido";

  const existing = equipos.find((x) => x.rowNumber === currentRow);
  const existingSnapshot = existing ? { ...existing } : null;

  $("btnSave").disabled = true;
  try {
    // Solo edición: la app ya no permite dar de alta equipos nuevos desde
    // acá (eso ahora pasa por Altas pendientes). Escribimos cada campo del
    // formulario + auditoría en su celda puntual — el resto de las
    // columnas de esa fila (fotos, verificación, datos contables) no se tocan.
    await writeEquipoFields(currentRow, data);
    await moverCarpetaSiCambioLugar(existingSnapshot, data);
    showToast("Equipo actualizado.");
    equipoFormDirty = false;
    closeDetailPanel();
    await loadEquipos();
  } catch (err) {
    console.error(err);
    showToast("No se pudo guardar. Revisá la conexión y los permisos de la planilla.", true);
  } finally {
    $("btnSave").disabled = false;
  }
}

// La app ya no permite eliminar registros del patrimonio, a propósito
// (evita pérdida accidental o intencional de datos). El botón de borrado
// y su función fueron quitados del todo — no hay ninguna forma de hacerlo
// desde la app, ni siquiera vía consola del navegador.

// ---------- Fotos (Google Drive) ----------

function makeUniqueFolderName(inventarioRaw, nuevoLugar) {
  const used = new Set(equipos.map((x) => x.nombreCarpeta).filter(Boolean));
  const base = inventarioRaw || "S/D";
  let label = `${base} - ${nuevoLugar}`;
  if (!used.has(label)) return label;
  let i = 2;
  while (used.has(`${base}-${i} - ${nuevoLugar}`)) i++;
  return `${base}-${i} - ${nuevoLugar}`;
}

// Si el equipo ya tiene carpeta de fotos y el Nuevo Lugar cambió al guardar,
// movemos esa carpeta a la subcarpeta del lugar nuevo y le actualizamos el
// nombre — para que no quede "perdida" en el lugar viejo.
async function moverCarpetaSiCambioLugar(existing, data) {
  if (!existing || !existing.photosFolderId) return; // sin carpeta todavía, nada que mover
  const lugarViejo = (existing.nuevoLugar || "").trim();
  const lugarNuevo = (data.nuevoLugar || "").trim();
  if (lugarViejo === lugarNuevo) return; // no cambió

  try {
    const lugarNuevoSanit = sanitizeForFolderName(lugarNuevo) || "sin-lugar";
    const nuevaCarpetaLugarId = await ensureLugarFolder(lugarNuevoSanit);
    const inv = (existing.inventario || "").trim();
    const nuevoNombre = makeUniqueFolderName(inv, lugarNuevoSanit);

    const meta = await gapi.client.drive.files.get({
      fileId: existing.photosFolderId,
      fields: "parents",
      supportsAllDrives: true,
    });
    const padresActuales = (meta.result.parents || []).join(",");

    await gapi.client.drive.files.update({
      fileId: existing.photosFolderId,
      addParents: nuevaCarpetaLugarId,
      removeParents: padresActuales,
      resource: { name: nuevoNombre },
      supportsAllDrives: true,
      fields: "id",
    });

    await writeEquipoFields(existing.rowNumber, { nombreCarpeta: nuevoNombre });
  } catch (err) {
    console.error(err);
    showToast("El equipo se guardó, pero no se pudo mover la carpeta de fotos — revisalo en Drive.", true);
  }
}

const lugarFolderCache = new Map(); // nombre de lugar -> ID de subcarpeta en Drive

// Busca (o crea) la subcarpeta de un "Nuevo Lugar" dentro de la carpeta de
// fotos general, para no tener las ~700 carpetas de equipos todas sueltas
// en un solo nivel — quedan agrupadas por lugar, como en un archivo físico.
async function ensureLugarFolder(nombreLugar) {
  const nombre = nombreLugar || "sin-lugar";
  if (lugarFolderCache.has(nombre)) return lugarFolderCache.get(nombre);

  const nombreEscapado = nombre.replace(/'/g, "\\'");
  const res = await gapi.client.drive.files.list({
    q: `'${CONFIG.PHOTOS_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${nombreEscapado}' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    pageSize: 1,
  });
  const encontrada = res.result.files || [];
  let folderId;
  if (encontrada.length) {
    folderId = encontrada[0].id;
  } else {
    const createRes = await gapi.client.drive.files.create({
      resource: { name: nombre, mimeType: "application/vnd.google-apps.folder", parents: [CONFIG.PHOTOS_FOLDER_ID] },
      fields: "id",
      supportsAllDrives: true,
    });
    folderId = createRes.result.id;
  }
  lugarFolderCache.set(nombre, folderId);
  return folderId;
}

async function ensurePhotosFolder() {
  const e = equipos.find((x) => x.rowNumber === currentRow);
  if (e && e.photosFolderId) return e.photosFolderId;

  const inv = ((e ? e.inventario : $("fInventario").value) || "").trim();
  const nuevoLugar = sanitizeForFolderName(
    (e && e.nuevoLugar) || resolveSelectWithOtro($("fNuevoLugar"), $("fNuevoLugarOtro"))
  ) || "sin-lugar";

  const label = makeUniqueFolderName(inv, nuevoLugar);
  const lugarFolderId = await ensureLugarFolder(nuevoLugar);

  const createRes = await gapi.client.drive.files.create({
    resource: {
      name: label,
      mimeType: "application/vnd.google-apps.folder",
      parents: [lugarFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const folderId = createRes.result.id;

  await writeEquipoFields(currentRow, {
    photosFolderId: folderId,
    ultimaModificacion: formatTimestamp(new Date()),
    modificadoPor: currentUserEmail || "desconocido",
    nombreCarpeta: label,
  });
  if (e) { e.photosFolderId = folderId; e.nombreCarpeta = label; }
  return folderId;
}

async function loadGallery(folderId) {
  $("gallery").innerHTML = "";
  galleryFiles = [];
  if (!folderId) {
    $("galleryEmpty").textContent = "Todavía no hay fotos de este equipo.";
    $("galleryEmpty").classList.remove("hidden");
    return;
  }
  $("galleryEmpty").classList.add("hidden");
  try {
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id, name, webViewLink)",
      orderBy: "createdTime",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
      pageSize: 100,
    });
    galleryFiles = res.result.files || [];
    if (galleryFiles.length === 0) {
      $("galleryEmpty").textContent = "Todavía no hay fotos de este equipo.";
      $("galleryEmpty").classList.remove("hidden");
    }
    await renderGallery();
  } catch (err) {
    console.error(err);
    showToast("No se pudieron cargar las fotos.", true);
  }
}

async function renderGallery() {
  const gal = $("gallery");
  gal.innerHTML = "";
  const e = equipos.find((x) => x.rowNumber === currentRow);
  const portadaId = e ? e.fotoPortadaId : "";
  for (const file of galleryFiles) {
    const item = document.createElement("div");
    item.className = "gallery-item";
    const esPortada = file.id === portadaId;
    item.innerHTML = `<img alt="${escapeHtml(file.name)}">
      <button class="gallery-star ${esPortada ? "active" : ""}" title="Marcar como foto de portada">★</button>
      <button class="gallery-del" title="Eliminar foto">✕</button>`;
    gal.appendChild(item);
    const img = item.querySelector("img");
    const starBtn = item.querySelector(".gallery-star");
    const delBtn = item.querySelector(".gallery-del");
    delBtn.addEventListener("click", (ev) => { ev.stopPropagation(); deletePhoto(file.id, item); });
    starBtn.addEventListener("click", (ev) => { ev.stopPropagation(); setFotoPortada(file.id); });
    img.addEventListener("click", () => openLightbox(img.src, file));
    fetchDriveImage(file.id).then((url) => { if (url) img.src = url; });
  }
}

async function setFotoPortada(fileId) {
  const e = equipos.find((x) => x.rowNumber === currentRow);
  if (!e) return;
  const nuevo = e.fotoPortadaId === fileId ? "" : fileId; // tocar la misma la desmarca
  try {
    await writeEquipoFields(currentRow, { fotoPortadaId: nuevo });
    e.fotoPortadaId = nuevo;
    renderGallery();
  } catch (err) {
    console.error(err);
    showToast("No se pudo marcar la foto de portada.", true);
  }
}

function openLightbox(src, file) {
  if (!src) return;
  $("lightboxImg").src = src;
  $("lightboxDriveLink").href = file.webViewLink || "#";
  $("lightbox").classList.remove("hidden");
  pushHistoryLayer();
}

function closeLightbox() {
  if (!$("lightbox").classList.contains("hidden")) history.back();
  else hideLightboxUI();
}

async function fetchDriveImage(fileId) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function handlePhotoUpload(fileList) {
  if (!currentRow) {
    showToast("Guardá el equipo primero.", true);
    return;
  }
  const files = Array.from(fileList);
  if (files.length === 0) return;

  $("uploadStatus").classList.remove("hidden");
  try {
    const folderId = await ensurePhotosFolder();
    for (let i = 0; i < files.length; i++) {
      $("uploadStatus").textContent = `Comprimiendo foto ${i + 1} de ${files.length}…`;
      const compressed = await compressImage(files[i]);
      $("uploadStatus").textContent = `Subiendo foto ${i + 1} de ${files.length}…`;
      await uploadOnePhoto(compressed, files[i].name, folderId);
    }
    showToast("Fotos subidas.");
    await loadGallery(folderId);
  } catch (err) {
    console.error(err);
    showToast("Error al subir la foto.", true);
  } finally {
    $("uploadStatus").classList.add("hidden");
    $("fPhotoInput").value = "";
  }
}

// Comprime/redimensiona una foto en el navegador antes de subirla, apuntando
// a ~300-400KB (buen equilibrio entre peso y calidad para fotos de equipos).
// Nunca sube el archivo original tal cual (que puede pesar 3-8MB de cámara).
async function compressImage(file, targetBytes = 380 * 1024, maxDim = 1600) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));

  let width = bitmap.width;
  let height = bitmap.height;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const render = (w, h) => {
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(bitmap, 0, 0, w, h);
  };
  const toBlob = (quality) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  render(width, height);
  let quality = 0.85;
  let blob = await toBlob(quality);

  // Bajar calidad hasta el objetivo, sin ir por debajo de una calidad legible.
  while (blob.size > targetBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(quality);
  }
  // Si con la calidad mínima todavía pesa mucho, reducir dimensiones también.
  while (blob.size > targetBytes * 1.4 && width > 500) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    render(width, height);
    blob = await toBlob(quality);
  }

  bitmap.close?.();
  return blob;
}

function uploadOnePhoto(blob, originalName, folderId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result.split(",")[1];
        const jpgName = originalName.replace(/\.[^.]+$/, "") + ".jpg";
        const metadata = { name: jpgName, parents: [folderId] };
        const boundary = "equipos_boundary_" + Date.now();
        const body =
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
          JSON.stringify(metadata) + `\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: image/jpeg\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          base64Data + `\r\n` +
          `--${boundary}--`;

        const res = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + accessToken,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          }
        );
        if (!res.ok) throw new Error(await res.text());
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function deletePhoto(fileId, itemEl) {
  if (!confirm("¿Eliminar esta foto?")) return;
  try {
    await gapi.client.drive.files.delete({ fileId, supportsAllDrives: true });
    itemEl.remove();
    galleryFiles = galleryFiles.filter((f) => f.id !== fileId);
    if (galleryFiles.length === 0) $("galleryEmpty").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    showToast("No se pudo eliminar la foto.", true);
  }
}

// ---------- Informe PDF ----------

const firstPhotoIdCache = new Map(); // photosFolderId -> fileId (o null)
const photoUrlCache = new Map(); // fileId -> object URL

async function getCoverPhotoFileId(e) {
  if (!e.photosFolderId) return null;
  if (e.fotoPortadaId) return e.fotoPortadaId;
  if (firstPhotoIdCache.has(e.photosFolderId)) return firstPhotoIdCache.get(e.photosFolderId);
  try {
    const res = await gapi.client.drive.files.list({
      q: `'${e.photosFolderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "files(id)",
      orderBy: "createdTime",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    });
    const files = res.result.files || [];
    const id = files.length ? files[0].id : null;
    firstPhotoIdCache.set(e.photosFolderId, id);
    return id;
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function fetchDriveImageCached(fileId) {
  if (photoUrlCache.has(fileId)) return photoUrlCache.get(fileId);
  const url = await fetchDriveImage(fileId);
  if (url) photoUrlCache.set(fileId, url);
  return url;
}

// Ejecuta fn sobre cada item, con hasta `limit` en simultáneo en vez de uno
// por uno — el cuello de botella del informe es esperar a la red, no la CPU,
// así que paralelizar acorta el tiempo total drásticamente.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function buildFilterSummary() {
  const f = getActiveFilters();
  const parts = [];
  if (f.ubic) parts.push("Ubicación: " + f.ubic);
  if (f.cat) parts.push("Categoría: " + f.cat);
  if (f.estado) parts.push("Estado oblea: " + f.estado);
  if (f.depto) parts.push("Departamento: " + f.depto);
  if (f.lugar) parts.push("Nuevo Lugar: " + f.lugar);
  if (f.estadoEquipo) parts.push("Estado equipo: " + f.estadoEquipo);
  if (f.verif) parts.push("Verificación: " + f.verif);
  if (f.q) parts.push(`Búsqueda: "${$("searchInput").value.trim()}"`);
  return parts.length ? parts.join(" · ") : "Todos los equipos";
}

function verifLabel(v) {
  if (v === "Encontrado") return "Encontrado";
  if (v === "No encontrado") return "No encontrado";
  return "Pendiente";
}

async function generatePdfReport() {
  const seleccion = currentFilteredEquipos;
  if (seleccion.length === 0) {
    showToast("No hay equipos para incluir en el informe con este filtro.", true);
    return;
  }

  const btn = $("btnReport");
  btn.disabled = true;
  const totalGeneral = equipos.length;
  let completed = 0;
  btn.textContent = `📄 Cargando fotos 0/${seleccion.length}…`;

  const items = await mapWithConcurrency(seleccion, 6, async (e) => {
    let photoUrl = null;
    try {
      const fileId = await getCoverPhotoFileId(e);
      if (fileId) photoUrl = await fetchDriveImageCached(fileId);
    } catch (err) {
      console.error(err);
    }
    completed++;
    btn.textContent = `📄 Cargando fotos ${completed}/${seleccion.length}…`;
    return { e, photoUrl };
  });

  btn.textContent = "📄 Generar informe PDF";
  btn.disabled = false;

  renderPrintReport(items, totalGeneral);
  await waitForImages($("printReport"));
  window.print();
}

function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

function renderPrintReport(items, totalGeneral) {
  const filtro = buildFilterSummary();
  const fecha = new Date().toLocaleDateString("es-AR");
  const perPage = 16;
  const totalPages = Math.ceil(items.length / perPage);
  let html = "";

  for (let p = 0; p < totalPages; p++) {
    const chunk = items.slice(p * perPage, p * perPage + perPage);
    html += `<div class="report-page">
      <div class="report-header">
        <div>
          <div class="report-title">Informe de relevamiento de equipos</div>
          <div class="report-sub">INTI Rafaela · ${escapeHtml(filtro)}</div>
        </div>
        <div class="report-date">${fecha} · Pág. ${p + 1}/${totalPages}</div>
      </div>
      <div class="report-grid">`;

    chunk.forEach(({ e, photoUrl }) => {
      const v = e.estadoVerificacion || "";
      const cls = v === "Encontrado" ? "ok" : v === "No encontrado" ? "missing" : "pending";
      const lugar = e.nuevoLugar || e.ubicacion || "sin lugar";
      html += `<div class="report-card ${cls}">
        <div class="report-photo">${photoUrl ? `<img src="${photoUrl}">` : "sin foto"}</div>
        <div class="report-info">
          <div class="report-row-top">
            <span class="report-code">${escapeHtml(displayCode(e))}${e.anio ? " · " + escapeHtml(e.anio) : ""}</span>
            <span class="report-verif ${cls}">${verifLabel(v)}</span>
          </div>
          <div class="report-desc">${escapeHtml(e.descripcion || "(sin descripción)")}</div>
          <div class="report-meta">${escapeHtml(e.categoria || "sin categoría")} · ${escapeHtml(e.modelo || "S/D")} · ${escapeHtml(e.serie || "S/D")}</div>
          <div class="report-meta">${escapeHtml(e.departamento || "sin depto.")} · ${escapeHtml(lugar)}</div>
          <div class="report-estado-equipo">${escapeHtml(e.estadoEquipo || "sin estado")}</div>
        </div>
      </div>`;
    });

    html += `</div>
      <div class="report-footer">${items.length} de ${totalGeneral} equipos filtrados</div>
    </div>`;
  }

  $("printReport").innerHTML = html;
}

// ---------- Escáner de código de barras ----------

let scannerStream = null;
let scannerActive = false;
let barcodeDetectorInstance = null;

function openScanner() {
  if (!("BarcodeDetector" in window)) {
    showToast("Tu navegador no soporta el escáner de códigos — buscá manualmente.", true);
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then((stream) => {
      scannerStream = stream;
      const video = $("scannerVideo");
      video.srcObject = stream;
      $("scannerOverlay").classList.remove("hidden");
      pushHistoryLayer();
      scannerActive = true;
      barcodeDetectorInstance = new BarcodeDetector({ formats: ["code_128", "code_39"] });
      scanLoop();
    })
    .catch((err) => {
      console.error(err);
      showToast("No se pudo acceder a la cámara.", true);
    });
}

function hideScannerUI() {
  scannerActive = false;
  $("scannerOverlay").classList.add("hidden");
  if (scannerStream) {
    scannerStream.getTracks().forEach((t) => t.stop());
    scannerStream = null;
  }
}

function closeScanner() {
  if (!$("scannerOverlay").classList.contains("hidden")) history.back();
  else hideScannerUI();
}

function scanLoop() {
  if (!scannerActive) return;
  const video = $("scannerVideo");
  barcodeDetectorInstance.detect(video)
    .then((codes) => {
      if (codes.length > 0) {
        const valor = codes[0].rawValue.trim();
        hideScannerUI();
        onBarcodeScanned(valor);
      } else if (scannerActive) {
        setTimeout(scanLoop, 250);
      }
    })
    .catch((err) => {
      console.error(err);
      if (scannerActive) setTimeout(scanLoop, 250);
    });
}

function onBarcodeScanned(valor) {
  $("searchInput").value = valor;
  renderList();

  if (currentFilteredEquipos.length === 1) {
    openDetail(currentFilteredEquipos[0].rowNumber);
    return;
  }
  if (currentFilteredEquipos.length > 1) {
    showToast(`${currentFilteredEquipos.length} resultados para "${valor}".`);
    return;
  }

  // No hay coincidencias en la base principal: ¿ya existe como alta pendiente?
  const existente = altasPendientes.find((a) => (a.inventario || "").trim() === valor.trim());
  if (existente) {
    showToast("Ya hay un hallazgo cargado para este código — abriendo…");
    openAltaPanel(null, existente.rowNumber);
    return;
  }
  if (confirm(`No se encontró "${valor}" en la base. ¿Querés cargarlo como hallazgo nuevo (alta pendiente)?`)) {
    openAltaPanel(valor);
  }
}

// ---------- Toast ----------

let toastTimer = null;
function showToast(msg, isError) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ---------- Eventos ----------

$("btnSignIn").addEventListener("click", handleSignIn);
$("btnSignInGate").addEventListener("click", handleSignIn);
$("btnSignOut").addEventListener("click", handleSignOut);
$("btnCloseDetail").addEventListener("click", closeDetailPanel);
$("btnCancel").addEventListener("click", closeDetailPanel);
$("overlay").addEventListener("click", closeDetailPanel);
$("btnSave").addEventListener("click", saveEquipo);
$("fPhotoInput").addEventListener("change", (e) => handlePhotoUpload(e.target.files));
$("btnCloseLightbox").addEventListener("click", closeLightbox);
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLightbox(); });

$("searchInput").addEventListener("input", renderList);
$("filterUbicacion").addEventListener("change", renderList);
$("filterCategoria").addEventListener("change", renderList);
$("filterEstado").addEventListener("change", renderList);
$("filterDepartamento").addEventListener("change", renderList);
$("filterNuevoLugar").addEventListener("change", renderList);
$("filterEstadoEquipo").addEventListener("change", renderList);
$("filterVerificacion").addEventListener("change", renderList);
$("btnReport").addEventListener("click", generatePdfReport);
$("btnScan").addEventListener("click", openScanner);
$("btnCloseScanner").addEventListener("click", closeScanner);

$("btnAltas").addEventListener("click", openAltasListView);
$("btnCloseAltasList").addEventListener("click", closeAltasListView);
$("btnReportAltas").addEventListener("click", generatePdfReportAltas);
$("btnCloseAlta").addEventListener("click", closeAltaPanel);
$("btnCancelAlta").addEventListener("click", closeAltaPanel);
$("overlayAlta").addEventListener("click", closeAltaPanel);
$("btnSaveAlta").addEventListener("click", saveAlta);
$("faPhotoInput").addEventListener("change", (e) => handleAltaPhotoUpload(e.target.files));
$("faDepartamento").addEventListener("change", () => {
  $("wrapFaDepartamentoOtro").classList.toggle("hidden", $("faDepartamento").value !== "Otro");
});

$("btnVerifOk").addEventListener("click", () => { if (currentRow) quickVerify(currentRow, "Encontrado"); });
$("btnVerifMissing").addEventListener("click", () => { if (currentRow) quickVerify(currentRow, "No encontrado"); });

$("fNuevoLugar").addEventListener("change", () => {
  $("wrapNuevoLugarOtro").classList.toggle("hidden", $("fNuevoLugar").value !== "Otro");
});
$("btnAddLugar").addEventListener("click", addNuevoLugarOption);
$("fDepartamento").addEventListener("change", () => {
  $("wrapDepartamentoOtro").classList.toggle("hidden", $("fDepartamento").value !== "Otro");
});
$("fEstadoEquipo").addEventListener("change", () => {
  $("wrapEstadoEquipoOtro").classList.toggle("hidden", $("fEstadoEquipo").value !== "Otro");
});

// Selects fijos: se arman una sola vez al cargar.
// Selects fijos: se arman una sola vez al cargar. Nuevo Lugar se vuelve a
// armar después con los valores reales de la planilla (ver loadLugares()).
buildSelectWithOtro($("fNuevoLugar"), lugaresDinamicos, "(sin definir)", false);
buildSelectWithOtro($("fDepartamento"), DEPARTAMENTOS, "(sin definir)");
buildSelectWithOtro($("faDepartamento"), DEPARTAMENTOS, "(sin definir)");
buildSelectWithOtro($("faEstadoEquipo"), ESTADO_EQUIPO_OPCIONES, "(sin definir)", false);

// ---------- Aviso de cambios sin guardar ----------
const EQUIPO_EDITABLE_IDS = ["fDepartamento", "fDepartamentoOtro", "fNuevoLugar", "fEstadoEquipo", "fEstadoEquipoOtro", "fCodigoSGC", "fObservaciones"];
EQUIPO_EDITABLE_IDS.forEach((id) => {
  $(id).addEventListener("input", () => { equipoFormDirty = true; });
  $(id).addEventListener("change", () => { equipoFormDirty = true; });
});
const ALTA_EDITABLE_IDS = ["faInventario", "faDescripcion", "faModelo", "faSerie", "faDepartamento", "faDepartamentoOtro", "faNuevoLugar", "faEstadoEquipo", "faCodigoSGC", "faObservaciones"];
ALTA_EDITABLE_IDS.forEach((id) => {
  $(id).addEventListener("input", () => { altaFormDirty = true; });
  $(id).addEventListener("change", () => { altaFormDirty = true; });
});

// Código SGC: solo números, en los dos formularios — filtra cualquier
// otro carácter apenas se escribe.
["fCodigoSGC", "faCodigoSGC"].forEach((id) => {
  $(id).addEventListener("input", () => {
    const limpio = $(id).value.replace(/[^0-9]/g, "");
    if (limpio !== $(id).value) $(id).value = limpio;
  });
});
buildSelectWithOtro($("fEstadoEquipo"), ESTADO_EQUIPO_OPCIONES, "(sin definir)", false);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- Instalar como app (Android/Chrome) ----------
// iPhone no permite disparar la instalación por código (Apple no lo deja);
// ahí el usuario siempre tiene que usar Compartir → Agregar a pantalla de
// inicio a mano. Este botón solo aparece donde el navegador lo permite.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $("btnInstall").classList.remove("hidden");
});
window.addEventListener("appinstalled", () => {
  $("btnInstall").classList.add("hidden");
  deferredInstallPrompt = null;
});
$("btnInstall").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("btnInstall").classList.add("hidden");
});

// Las librerías de Google (api.js y gsi/client) son <script> normales sin
// async/defer, así que para cuando el navegador llega a ejecutar este
// archivo ya terminaron de cargar y sus globals (gapi, google.accounts)
// ya existen. Las llamamos directo acá en vez de con onload="" en el HTML,
// que generaba una carrera de tiempos (a veces disparaba antes de que
// estas funciones existieran).
gapiLoaded();
gisLoaded();

// "Colchón" en el historial: sin esto, el primerísimo toque de "atrás"
// podría salir directo de la app sin que popstate llegue a interceptarlo.
pushHistoryLayer();
