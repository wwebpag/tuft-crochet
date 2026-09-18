// Usuario y repositorio salen de config.js (fijo por tienda, lo carga quien
// arma el repo). El vendedor nunca ve ni escribe esto.
const REPO_OWNER = (window.SITE_CONFIG && window.SITE_CONFIG.owner) || "";
const REPO_NAME = (window.SITE_CONFIG && window.SITE_CONFIG.repo) || "";
const LS_KEY = "feriaAdminConfig:" + (REPO_NAME || "local");

// Paletas prearmadas: el vendedor elige tocando, sin escribir ningún código de color.
const PALETTES = [
  { name: "Feria clásica", fondo: "#202b3d", acentos: ["#ff6b5b", "#2ec4b6", "#f2b134", "#e4569e", "#8fc93a"] },
  { name: "Tropical", fondo: "#0f3d3e", acentos: ["#ff8c42", "#ffd23f", "#06d6a0", "#ff5e78", "#2ec4b6"] },
  { name: "Boutique", fondo: "#341b34", acentos: ["#ff6fb5", "#c77dff", "#ffd166", "#f77f00", "#e0aaff"] },
  { name: "Noche neón", fondo: "#12122b", acentos: ["#ff2e63", "#08d9d6", "#f9c80e", "#a239ea", "#00f5d4"] },
  { name: "Otoño", fondo: "#2b1d14", acentos: ["#d1495b", "#edae49", "#00798c", "#30638e", "#ff8c42"] },
  { name: "Océano", fondo: "#0b2545", acentos: ["#276fbf", "#4cc9f0", "#f4d35e", "#ee6c4d", "#13315c"] },
];

let currentColores = { fondo: PALETTES[0].fondo, acentos: [...PALETTES[0].acentos] };

function paletteMatches(p, colores) {
  return colores && colores.fondo === p.fondo && JSON.stringify(colores.acentos) === JSON.stringify(p.acentos);
}

function renderPaletteGrid() {
  const grid = document.getElementById("paletteGrid");
  grid.innerHTML = "";
  PALETTES.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (paletteMatches(p, currentColores) ? " selected" : "");
    btn.style.background = p.fondo;
    btn.title = p.name;
    btn.setAttribute("aria-label", p.name);
    p.acentos.forEach((c) => {
      const dot = document.createElement("span");
      dot.style.background = c;
      btn.appendChild(dot);
    });
    btn.addEventListener("click", () => choosePalette(p));
    grid.appendChild(btn);
  });
}

function choosePalette(p) {
  currentColores = { fondo: p.fondo, acentos: [...p.acentos] };
  syncColorInputs();
  renderPaletteGrid();
}

function syncColorInputs() {
  document.getElementById("colorFondo").value = currentColores.fondo;
  currentColores.acentos.forEach((c, i) => {
    document.getElementById(`colorAcento${i + 1}`).value = c;
  });
}

function readColorInputs() {
  currentColores = {
    fondo: document.getElementById("colorFondo").value,
    acentos: [1, 2, 3, 4, 5].map((i) => document.getElementById(`colorAcento${i}`).value),
  };
  renderPaletteGrid();
}

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || null;
  } catch (e) {
    return null;
  }
}

function setConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

function b64EncodeUnicode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode("0x" + p1)
    )
  );
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function apiUrl(path) {
  const cfg = getConfig();
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

async function ghGetFile(path) {
  const cfg = getConfig();
  const res = await fetch(apiUrl(path), {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`No se pudo leer ${path} (${res.status})`);
  const data = await res.json();
  return { sha: data.sha, content: b64DecodeUnicode(data.content.replace(/\n/g, "")) };
}

async function ghPutFile(path, base64Content, message, sha) {
  const cfg = getConfig();
  // No forzamos "branch" acá: si no se especifica, la API usa la rama por
  // defecto del repo (puede ser "main" o "master" según cómo lo creó GitHub).
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `No se pudo guardar ${path} (${res.status})`);
  }
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "-").toLowerCase();
}

function setStatus(el, text, ok) {
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
}

function money(n) {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
}

// ---------- Conexión ----------

async function testConnection() {
  const token = document.getElementById("ghToken").value.trim();
  const statusEl = document.getElementById("connectStatus");

  if (!REPO_OWNER || !REPO_NAME || REPO_OWNER === "TU-USUARIO-DE-GITHUB") {
    setStatus(statusEl, "Falta configurar esta tienda (archivo config.js). Avisale a quien la armó.", false);
    return;
  }
  if (!token) {
    setStatus(statusEl, "Pegá tu clave de acceso.", false);
    return;
  }

  setConfig({ owner: REPO_OWNER, repo: REPO_NAME, token });
  setStatus(statusEl, "Entrando...", true);

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("Esa clave no funciona para esta tienda. Pedile una nueva a quien te la dio.");
    setStatus(statusEl, "", true);
    document.getElementById("loginGate").hidden = true;
    document.getElementById("liveLink").innerHTML =
      `Tu tienda: <a href="https://${REPO_OWNER}.github.io/${REPO_NAME}/" target="_blank" style="color:var(--mustard)">https://${REPO_OWNER}.github.io/${REPO_NAME}/</a>`;
    revealPanels();
    await loadSite();
    await loadMaterials();
    await loadProducts();
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
}

function revealPanels() {
  document.getElementById("adminTabs").hidden = false;
  showTab("siteInfoPanel");
}

function showTab(panelId) {
  ["siteInfoPanel", "materialsPanel", "addPanel", "listPanel"].forEach((id) => {
    document.getElementById(id).hidden = id !== panelId;
  });
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === panelId);
  });
}

// ---------- Datos de la tienda ----------

let siteRedondeoGeneral = 100;

async function loadSite() {
  const file = await ghGetFile("site.json");
  if (!file) {
    syncColorInputs();
    renderPaletteGrid();
    return;
  }
  const site = JSON.parse(file.content);
  document.getElementById("siteNameInput").value = site.nombre || "";
  document.getElementById("siteTaglineInput").value = site.eslogan || "";
  document.getElementById("siteWhatsapp").value = site.whatsapp || "";
  document.getElementById("siteInstagram").value = site.instagram || "";
  document.getElementById("siteRedondeo").value = site.redondeo || 100;
  siteRedondeoGeneral = Number(site.redondeo) || 100;

  if (site.colores && Array.isArray(site.colores.acentos) && site.colores.acentos.length === 5) {
    currentColores = { fondo: site.colores.fondo, acentos: [...site.colores.acentos] };
  }
  syncColorInputs();
  renderPaletteGrid();
}

async function saveSite() {
  const statusEl = document.getElementById("siteStatus");
  setStatus(statusEl, "Guardando...", true);
  try {
    const existing = await ghGetFile("site.json");
    const site = {
      nombre: document.getElementById("siteNameInput").value.trim(),
      eslogan: document.getElementById("siteTaglineInput").value.trim(),
      whatsapp: document.getElementById("siteWhatsapp").value.trim(),
      instagram: document.getElementById("siteInstagram").value.trim(),
      redondeo: Number(document.getElementById("siteRedondeo").value) || 100,
      colores: currentColores,
    };
    if (existing) {
      const prev = JSON.parse(existing.content);
      site.activa = prev.activa !== false;
    } else {
      site.activa = true;
    }
    await ghPutFile(
      "site.json",
      b64EncodeUnicode(JSON.stringify(site, null, 2)),
      "Actualizar datos de la tienda",
      existing ? existing.sha : undefined
    );
    siteRedondeoGeneral = site.redondeo;
    recalcular();
    await recalcularProductosGuardados();
    setStatus(statusEl, "Guardado ✓ (puede tardar ~1 min en verse)", true);
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
}

// ---------- Materias primas ----------

let materialsCache = [];
let editingMaterialId = null;

async function loadMaterials() {
  const listEl = document.getElementById("materialList");
  listEl.innerHTML = "Cargando...";
  const file = await ghGetFile("materiales.json");
  materialsCache = file ? JSON.parse(file.content) : [];
  renderMaterialList();
  renderMuOptions();
}

function renderMaterialList() {
  const listEl = document.getElementById("materialList");
  listEl.innerHTML = "";
  if (materialsCache.length === 0) {
    listEl.innerHTML = "<p class='hint'>Todavía no cargaste materias primas.</p>";
    return;
  }
  const unidades = ["gramo", "metro", "unidad", "ovillo", "ml", "cm"];
  materialsCache.forEach((m) => {
    const row = document.createElement("div");
    row.className = "material-row";
    if (editingMaterialId === m.id) {
      row.innerHTML = `
        <div class="material-edit-fields">
          <input type="text" value="${m.nombre}" data-edit="nombre">
          <select data-edit="unidad">
            ${unidades.map((u) => `<option value="${u}" ${m.unidad === u ? "selected" : ""}>${u}</option>`).join("")}
          </select>
          <input type="text" value="${m.precioUnitario}" data-edit="precio">
        </div>
        <button data-action="guardar" data-id="${m.id}">Guardar</button>
        <button class="secondary" data-action="cancelar">Cancelar</button>
      `;
    } else {
      row.innerHTML = `
        <div class="info"><b>${m.nombre}</b><span>${money(m.precioUnitario)} / ${m.unidad}</span></div>
        <button class="secondary" data-action="editar" data-id="${m.id}">Editar</button>
        <button class="danger" data-action="borrar" data-id="${m.id}">Borrar</button>
      `;
    }
    listEl.appendChild(row);
  });

  listEl.querySelectorAll('[data-action="editar"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      editingMaterialId = btn.dataset.id;
      renderMaterialList();
    });
  });
  listEl.querySelectorAll('[data-action="cancelar"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      editingMaterialId = null;
      renderMaterialList();
    });
  });
  listEl.querySelectorAll('[data-action="borrar"]').forEach((btn) => {
    btn.addEventListener("click", () => deleteMaterial(btn.dataset.id));
  });
  listEl.querySelectorAll('[data-action="guardar"]').forEach((btn) => {
    btn.addEventListener("click", () => saveMaterialEdit(btn.dataset.id));
  });
}

async function saveMaterialEdit(id) {
  const row = [...document.querySelectorAll(".material-row")].find((r) =>
    r.querySelector(`[data-action="guardar"][data-id="${id}"]`)
  );
  const nombre = row.querySelector('[data-edit="nombre"]').value.trim();
  const unidad = row.querySelector('[data-edit="unidad"]').value;
  const precioUnitario = Number(row.querySelector('[data-edit="precio"]').value.replace(",", "."));

  if (!nombre) {
    alert("Ponele un nombre a la materia prima.");
    return;
  }
  if (!precioUnitario || precioUnitario <= 0) {
    alert("Ingresá un precio válido.");
    return;
  }

  const statusEl = document.getElementById("materialStatus");
  setStatus(statusEl, "Guardando...", true);
  try {
    materialsCache = materialsCache.map((m) => (m.id === id ? { ...m, nombre, unidad, precioUnitario } : m));
    await saveMaterials(materialsCache, `Editar materia prima: ${nombre}`);
    editingMaterialId = null;
    renderMaterialList();
    renderMuOptions();
    recalcular();
    setStatus(statusEl, "Actualizando precios de productos...", true);
    const huboCambios = await recalcularProductosGuardados();
    setStatus(
      statusEl,
      huboCambios ? "Guardado ✓ — los productos que la usan ya tienen el precio actualizado" : "Guardado ✓",
      true
    );
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
}

async function saveMaterials(materials, message) {
  const existing = await ghGetFile("materiales.json");
  await ghPutFile(
    "materiales.json",
    b64EncodeUnicode(JSON.stringify(materials, null, 2)),
    message,
    existing ? existing.sha : undefined
  );
}

async function addMaterial() {
  const statusEl = document.getElementById("materialStatus");
  const nombre = document.getElementById("mNombre").value.trim();
  const unidad = document.getElementById("mUnidad").value;
  const precioUnitario = Number(document.getElementById("mPrecio").value.replace(",", "."));

  if (!nombre) {
    setStatus(statusEl, "Ponele un nombre a la materia prima.", false);
    return;
  }
  if (!precioUnitario || precioUnitario <= 0) {
    setStatus(statusEl, "Ingresá un precio válido.", false);
    return;
  }

  setStatus(statusEl, "Guardando...", true);
  try {
    const nuevo = { id: Date.now().toString(36), nombre, unidad, precioUnitario };
    materialsCache = [...materialsCache, nuevo];
    await saveMaterials(materialsCache, `Agregar materia prima: ${nombre}`);
    document.getElementById("mNombre").value = "";
    document.getElementById("mPrecio").value = "";
    renderMaterialList();
    renderMuOptions();
    recalcular();
    await recalcularProductosGuardados();
    setStatus(statusEl, "Guardado ✓", true);
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
}

async function deleteMaterial(id) {
  if (!confirm("¿Borrar esta materia prima? Si algún producto la usa, va a quedar sin ese costo.")) return;
  try {
    materialsCache = materialsCache.filter((m) => m.id !== id);
    await saveMaterials(materialsCache, "Borrar materia prima");
    renderMaterialList();
    renderMuOptions();
    recalcular();
    await recalcularProductosGuardados();
  } catch (e) {
    alert(e.message);
  }
}

// Recalcula el precio de TODOS los productos guardados en base a los
// precios actuales de materiales primas (se llama después de agregar,
// editar o borrar una materia prima, y después de guardar la config
// general por si cambió el redondeo).
async function recalcularProductosGuardados() {
  const existing = await ghGetFile("products.json");
  if (!existing) return false;
  const products = JSON.parse(existing.content);
  let changed = false;

  products.forEach((p) => {
    if (p.materiales && p.materiales.length) {
      const { precioFinal } = calcularPrecioDesdeDatos(p.materiales, p.manoObraPorcentaje, p.redondeo);
      if (precioFinal !== p.price) {
        p.price = precioFinal;
        changed = true;
      }
    }
  });

  if (changed) {
    await ghPutFile(
      "products.json",
      b64EncodeUnicode(JSON.stringify(products, null, 2)),
      "Recalcular precios por cambio en materias primas",
      existing.sha
    );
    productsCache = products;
    if (!document.getElementById("listPanel").hidden) await loadProducts();
  }
  return changed;
}

// ---------- Materiales usados en el producto (filas dinámicas) ----------

let muRows = []; // [{ materialId, cantidad }]

function renderMuOptions() {
  // refresca los <select> de filas ya agregadas si cambió la lista de materiales
  document.querySelectorAll(".mu-row select").forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = materialsCache
      .map((m) => `<option value="${m.id}">${m.nombre} (${money(m.precioUnitario)}/${m.unidad})</option>`)
      .join("");
    if (current) sel.value = current;
  });
}

function renderMuList() {
  const cont = document.getElementById("muList");
  cont.innerHTML = "";
  if (materialsCache.length === 0) {
    cont.innerHTML = "<p class='hint'>Primero cargá materias primas más arriba.</p>";
    return;
  }
  muRows.forEach((row, idx) => {
    const div = document.createElement("div");
    div.className = "mu-row";
    div.innerHTML = `
      <select data-idx="${idx}" data-role="material">
        ${materialsCache.map((m) => `<option value="${m.id}" ${m.id === row.materialId ? "selected" : ""}>${m.nombre} (${money(m.precioUnitario)}/${m.unidad})</option>`).join("")}
      </select>
      <input type="number" min="0" step="0.01" value="${row.cantidad || ""}" placeholder="cant." data-idx="${idx}" data-role="cantidad">
      <button type="button" data-idx="${idx}" data-role="quitar">✕</button>
    `;
    cont.appendChild(div);
  });

  cont.querySelectorAll('[data-role="material"]').forEach((sel) => {
    sel.addEventListener("change", (e) => {
      muRows[e.target.dataset.idx].materialId = e.target.value;
      recalcular();
    });
  });
  cont.querySelectorAll('[data-role="cantidad"]').forEach((inp) => {
    inp.addEventListener("input", (e) => {
      muRows[e.target.dataset.idx].cantidad = Number(e.target.value) || 0;
      recalcular();
    });
  });
  cont.querySelectorAll('[data-role="quitar"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      muRows.splice(Number(e.target.dataset.idx), 1);
      renderMuList();
      recalcular();
    });
  });
}

function addMuRow() {
  if (materialsCache.length === 0) {
    alert("Primero cargá al menos una materia prima.");
    return;
  }
  muRows.push({ materialId: materialsCache[0].id, cantidad: 0 });
  renderMuList();
  recalcular();
}

function calcularPrecioDesdeDatos(materiales, manoObraPorcentaje, redondeoProducto) {
  const costoMateriales = (materiales || []).reduce((total, row) => {
    const mat = materialsCache.find((m) => m.id === row.materialId);
    if (!mat) return total;
    return total + (Number(row.cantidad) || 0) * (Number(mat.precioUnitario) || 0);
  }, 0);
  const manoObra = Number(manoObraPorcentaje) || 0;
  const costoConManoObra = costoMateriales * (1 + manoObra / 100);
  const multiplo = redondeoProducto ? Number(redondeoProducto) : siteRedondeoGeneral;
  const precioFinal = Math.ceil(costoConManoObra / multiplo) * multiplo;
  return { costoMateriales, manoObra, costoConManoObra, precioFinal };
}

function calcularCosto() {
  const manoObra = document.getElementById("pManoObra").value;
  const redondeoInput = document.getElementById("pRedondeo").value;
  return calcularPrecioDesdeDatos(muRows, manoObra, redondeoInput);
}

function recalcular() {
  const box = document.getElementById("calcBox");
  if (!box) return;
  const { costoMateriales, manoObra, costoConManoObra, precioFinal } = calcularCosto();
  box.innerHTML = `
    Costo de materiales: ${money(costoMateriales)}<br>
    + ${manoObra}% de mano de obra: ${money(costoConManoObra)}<br>
    <span class="final">Precio final: ${money(precioFinal)}</span>
  `;
}

// ---------- Productos ----------

let editingId = null;
let productsCache = [];

async function loadProducts() {
  const listEl = document.getElementById("productList");
  listEl.innerHTML = "Cargando...";
  const file = await ghGetFile("products.json");
  productsCache = file ? JSON.parse(file.content) : [];
  listEl.innerHTML = "";
  if (productsCache.length === 0) {
    listEl.innerHTML = "<p class='hint'>Todavía no cargaste productos.</p>";
    return;
  }
  productsCache.forEach((p) => {
    const row = document.createElement("div");
    row.className = "product-row";
    row.innerHTML = `
      ${p.images && p.images[0] ? `<img src="${p.images[0]}">` : ""}
      <div class="info"><b>${p.name}</b><span>${money(p.price)}</span></div>
      <button class="secondary" data-action="edit" data-id="${p.id}">Editar</button>
      <button class="danger" data-action="delete" data-id="${p.id}">Borrar</button>
    `;
    row.querySelector('[data-action="edit"]').addEventListener("click", () => startEdit(p.id));
    row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProduct(p.id));
    listEl.appendChild(row);
  });
}

function startEdit(id) {
   const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  showTab("addPanel");
  editingId = id;
  document.getElementById("pName").value = p.name || "";
  document.getElementById("pCategory").value = p.category || "";
  document.getElementById("pDescription").value = p.description || "";
  document.getElementById("pManoObra").value = p.manoObraPorcentaje ?? 50;
  document.getElementById("pRedondeo").value = p.redondeo || "";
  document.getElementById("pVideoLink").value = p.videoLink || "";
  document.getElementById("pImage").value = "";
  document.getElementById("pVideo").value = "";
  muRows = (p.materiales || []).map((mu) => ({ ...mu }));
  renderMuList();
  recalcular();

  const note = document.getElementById("currentImageNote");
  const hasMedia = (p.images && p.images[0]) || p.video;
  if (hasMedia) {
    note.style.display = "block";
    note.textContent = "Ya tiene foto/video cargado. Elegí un archivo nuevo solo si querés reemplazarlo.";
  } else {
    note.style.display = "none";
  }

  document.getElementById("addPanelTitle").textContent = "Editar producto";
  document.getElementById("btnAddProduct").textContent = "Guardar cambios";
  document.getElementById("btnCancelEdit").hidden = false;
  document.getElementById("addPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEdit() {
  editingId = null;
  document.getElementById("pName").value = "";
  document.getElementById("pCategory").value = "";
  document.getElementById("pDescription").value = "";
  document.getElementById("pManoObra").value = 50;
  document.getElementById("pRedondeo").value = "";
  document.getElementById("pImage").value = "";
  document.getElementById("pVideo").value = "";
  document.getElementById("pVideoLink").value = "";
  document.getElementById("currentImageNote").style.display = "none";
  document.getElementById("addPanelTitle").textContent = "Agregar producto";  
  document.getElementById("btnAddProduct").textContent = "Subir producto";
  document.getElementById("btnCancelEdit").hidden = true;
  document.getElementById("addStatus").textContent = "";
  muRows = [];
  renderMuList();
  recalcular();
}

async function saveProduct() {
  const statusEl = document.getElementById("addStatus");
  const btn = document.getElementById("btnAddProduct");
  const name = document.getElementById("pName").value.trim();
  const category = document.getElementById("pCategory").value.trim();
  const description = document.getElementById("pDescription").value.trim();
  const manoObraPorcentaje = Number(document.getElementById("pManoObra").value) || 0;
  const redondeoInput = document.getElementById("pRedondeo").value;
  const redondeo = redondeoInput ? Number(redondeoInput) : null;
  const imageFile = document.getElementById("pImage").files[0];
  const videoFile = document.getElementById("pVideo").files[0];
  const videoLink = document.getElementById("pVideoLink").value.trim();

  if (!name) {
    setStatus(statusEl, "Ponele un nombre al producto.", false);
    return;
  }
  if (videoFile && videoFile.size > 25 * 1024 * 1024) {
    setStatus(statusEl, "El video pesa mucho (>25 MB). Comprimilo o usá un link.", false);
    return;
  }

  const { precioFinal } = calcularCosto();

  btn.disabled = true;
  try {
    const stamp = Date.now();
    const existingProduct = editingId ? productsCache.find((x) => x.id === editingId) : null;
    let imagePath = existingProduct ? (existingProduct.images && existingProduct.images[0]) || null : null;
    let videoPath = existingProduct ? existingProduct.video || null : null;

    if (imageFile) {
      setStatus(statusEl, "Subiendo foto...", true);
      const b64 = await fileToBase64(imageFile);
      imagePath = `assets/${stamp}-${sanitizeFilename(imageFile.name)}`;
      await ghPutFile(imagePath, b64, `Actualizar foto: ${name}`);
    }
    if (videoFile) {
      setStatus(statusEl, "Subiendo video...", true);
      const b64 = await fileToBase64(videoFile);
      videoPath = `assets/${stamp}-${sanitizeFilename(videoFile.name)}`;
      await ghPutFile(videoPath, b64, `Actualizar video: ${name}`);
    }

    setStatus(statusEl, "Guardando producto...", true);
    const existing = await ghGetFile("products.json");
    const products = existing ? JSON.parse(existing.content) : [];

    const datosProducto = {
      name,
      price: precioFinal,
      category,
      description,
      materiales: muRows.filter((r) => r.materialId),
      manoObraPorcentaje,
      redondeo,
      images: imagePath ? [imagePath] : [],
      video: videoPath,
      videoLink: videoLink || null,
    };

    if (editingId) {
      const idx = products.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        products[idx] = { ...products[idx], ...datosProducto };
      }
    } else {
      products.unshift({ id: stamp.toString(36), ...datosProducto });
    }

    await ghPutFile(
      "products.json",
      b64EncodeUnicode(JSON.stringify(products, null, 2)),
      editingId ? `Editar producto: ${name}` : `Agregar producto: ${name}`,
      existing ? existing.sha : undefined
    );

    setStatus(statusEl, "Guardado ✓ (puede tardar ~1 min en verse)", true);
    cancelEdit();
    await loadProducts();
  } catch (e) {
    setStatus(statusEl, e.message, false);
  } finally {
    btn.disabled = false;
  }
}

async function deleteProduct(id) {
  if (!confirm("¿Borrar este producto de la tienda?")) return;
  try {
    const existing = await ghGetFile("products.json");
    const products = existing ? JSON.parse(existing.content) : [];
    const filtered = products.filter((p) => p.id !== id);
    await ghPutFile(
      "products.json",
      b64EncodeUnicode(JSON.stringify(filtered, null, 2)),
      "Borrar producto",
      existing.sha
    );
    if (editingId === id) cancelEdit();
    await loadProducts();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Init ----------

function init() {
  const cfg = getConfig();
  if (cfg && cfg.token) {
    document.getElementById("ghToken").value = cfg.token;
    testConnection();
  }

  document.getElementById("advancedColorToggle").addEventListener("click", () => {
    const el = document.getElementById("advancedColorFields");
    el.hidden = !el.hidden;
  });
  ["colorFondo", "colorAcento1", "colorAcento2", "colorAcento3", "colorAcento4", "colorAcento5"].forEach((id) => {
    document.getElementById(id).addEventListener("input", readColorInputs);
  });
  renderPaletteGrid();

  document.getElementById("btnConnect").addEventListener("click", testConnection);
  document.getElementById("btnSaveSite").addEventListener("click", saveSite);
  document.getElementById("btnAddMaterial").addEventListener("click", addMaterial);
  document.getElementById("btnAddMu").addEventListener("click", addMuRow);
  document.getElementById("pManoObra").addEventListener("input", recalcular);
  document.getElementById("pRedondeo").addEventListener("input", recalcular);
  document.getElementById("btnAddProduct").addEventListener("click", saveProduct);
  document.getElementById("btnCancelEdit").addEventListener("click", cancelEdit);
  document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  renderMuList();
  recalcular();
}

init();
