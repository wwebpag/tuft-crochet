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
    await loadProducts();
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
}

function revealPanels() {
  document.getElementById("siteInfoPanel").hidden = false;
  document.getElementById("addPanel").hidden = false;
  document.getElementById("listPanel").hidden = false;
}

// ---------- Datos de la tienda ----------

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
      colores: currentColores,
    };
    await ghPutFile(
      "site.json",
      b64EncodeUnicode(JSON.stringify(site, null, 2)),
      "Actualizar datos de la tienda",
      existing ? existing.sha : undefined
    );
    setStatus(statusEl, "Guardado ✓ (puede tardar ~1 min en verse)", true);
  } catch (e) {
    setStatus(statusEl, e.message, false);
  }
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
      <div class="info"><b>${p.name}</b><span>${p.price || ""}${p.condicion ? " · " + (p.condicion === "nuevo" ? "Nuevo" : "Usado") : ""}</span></div>
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
  editingId = id;

  document.getElementById("pName").value = p.name || "";
  document.getElementById("pPrice").value = p.price || "";
  document.getElementById("pCategory").value = p.category || "";
  document.getElementById("pCondicion").value = p.condicion || "usado";
  document.getElementById("pDescription").value = p.description || "";
  document.getElementById("pVideoLink").value = p.videoLink || "";
  document.getElementById("pImage").value = "";
  document.getElementById("pVideo").value = "";

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
  document.getElementById("pPrice").value = "";
  document.getElementById("pCategory").value = "";
  document.getElementById("pCondicion").value = "usado";
  document.getElementById("pDescription").value = "";
  document.getElementById("pImage").value = "";
  document.getElementById("pVideo").value = "";
  document.getElementById("pVideoLink").value = "";
  document.getElementById("currentImageNote").style.display = "none";
  document.getElementById("addPanelTitle").textContent = "3. Agregar producto";
  document.getElementById("btnAddProduct").textContent = "Subir producto";
  document.getElementById("btnCancelEdit").hidden = true;
  document.getElementById("addStatus").textContent = "";
}

async function saveProduct() {
  const statusEl = document.getElementById("addStatus");
  const btn = document.getElementById("btnAddProduct");
  const name = document.getElementById("pName").value.trim();
  const price = document.getElementById("pPrice").value.trim();
  const category = document.getElementById("pCategory").value.trim();
  const condicion = document.getElementById("pCondicion").value;
  const description = document.getElementById("pDescription").value.trim();
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

    if (editingId) {
      const idx = products.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        products[idx] = {
          ...products[idx],
          name,
          price,
          category,
          condicion,
          description,
          images: imagePath ? [imagePath] : [],
          video: videoPath,
          videoLink: videoLink || null,
        };
      }
    } else {
      products.unshift({
        id: stamp.toString(36),
        name,
        price,
        category,
        condicion,
        description,
        images: imagePath ? [imagePath] : [],
        video: videoPath,
        videoLink: videoLink || null,
      });
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
  document.getElementById("btnAddProduct").addEventListener("click", saveProduct);
  document.getElementById("btnCancelEdit").addEventListener("click", cancelEdit);
}

init();
