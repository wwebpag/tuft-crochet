async function loadJSON(path) {
  try {
    const res = await fetch(path + "?t=" + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

const DEFAULT_PALETTE = {
  fondo: "#202b3d",
  acentos: ["#ff6b5b", "#2ec4b6", "#f2b134", "#e4569e", "#8fc93a"],
};
let ACCENTS = DEFAULT_PALETTE.acentos.slice();
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let SITE = null;
let CATEGORIES = [];
let ALL_PRODUCTS = [];

function hexToRgba(hex, alpha) {
  const h = (hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (isNaN(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function applyPalette(colores) {
  const c =
    colores && Array.isArray(colores.acentos) && colores.acentos.length === 5 && colores.fondo
      ? colores
      : DEFAULT_PALETTE;
  ACCENTS = c.acentos.slice();
  const root = document.documentElement.style;
  root.setProperty("--navy", c.fondo);
  c.acentos.forEach((hex, i) => root.setProperty(`--c${i + 1}`, hex));
  const spots = [
    [15, 8],
    [85, 18],
    [75, 75],
    [20, 85],
  ];
  const gradients = c.acentos
    .slice(0, 4)
    .map(
      (hex, i) =>
        `radial-gradient(circle at ${spots[i][0]}% ${spots[i][1]}%, ${hexToRgba(hex, 0.1)} 0, transparent 42%)`
    )
    .join(", ");
  document.body.style.backgroundImage = gradients;
}

function accentFor(seed) {
  if (!seed) return ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function isYouTube(url) {
  return /youtu\.?be/.test(url || "");
}

function toYouTubeEmbed(url) {
  const idMatch = url.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{6,})/);
  return idMatch ? `https://www.youtube.com/embed/${idMatch[1]}` : null;
}

function renderBunting() {
  const el = document.getElementById("bunting");
  if (!el) return;
  const count = Math.min(18, Math.max(8, Math.floor(window.innerWidth / 40)));
  el.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const flag = document.createElement("span");
    flag.className = "flag";
    flag.style.setProperty("--fc", ACCENTS[i % ACCENTS.length]);
    flag.style.setProperty("--fd", `${(i % 5) * 0.15}s`);
    el.appendChild(flag);
  }
}

function renderSite(site) {
  if (!site) return;
  document.title = (site.nombre || "Tienda").replace(/<[^>]+>/g, "");
  document.getElementById("siteName").innerHTML = site.nombre || "Mi Tienda";
  document.getElementById("siteTagline").innerHTML = site.eslogan || "";
  const footerEl = document.getElementById("footerText");
  if (footerEl) footerEl.innerHTML = site.footerTexto || "Hecho con hilo y aguja 🧵";
  const row = document.getElementById("contactRow");
  row.innerHTML = "";
  if (site.whatsapp) {
    const digits = site.whatsapp.replace(/[^0-9]/g, "");
    const a = document.createElement("a");
    a.href = `https://wa.me/${digits}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "contact-btn";
    a.textContent = "WhatsApp";
    row.appendChild(a);
  }
  if (site.instagram) {
    const handle = site.instagram.replace("@", "");
    const a = document.createElement("a");
    a.href = `https://instagram.com/${handle}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "contact-btn alt";
    a.textContent = "@" + handle;
    row.appendChild(a);
  }

  const banner = document.getElementById("ofertaGlobalBanner");
  if (site.ofertaGlobal && site.ofertaGlobal.activa && site.ofertaGlobal.porcentaje > 0) {
    banner.hidden = false;
    banner.textContent = `🎉 ${site.ofertaGlobal.porcentaje}% OFF en toda la tienda`;
  } else {
    banner.hidden = true;
  }
}

function money(n) {
  if (typeof n === "number") return "$" + Math.round(n).toLocaleString("es-AR");
  return n || "";
}

// ---------- Ofertas ----------

function ofertaVigente(product) {
  if (product.oferta && product.oferta.activa && Number(product.oferta.porcentaje) > 0) {
    return Number(product.oferta.porcentaje);
  }
  const cat = CATEGORIES.find((c) => c.nombre === product.category);
  if (cat && cat.oferta && cat.oferta.activa && Number(cat.oferta.porcentaje) > 0) {
    return Number(cat.oferta.porcentaje);
  }
  if (SITE && SITE.ofertaGlobal && SITE.ofertaGlobal.activa && Number(SITE.ofertaGlobal.porcentaje) > 0) {
    return Number(SITE.ofertaGlobal.porcentaje);
  }
  return 0;
}

function precioConOferta(product) {
  const base = typeof product.price === "number" ? product.price : Number(product.price) || 0;
  const pct = ofertaVigente(product);
  if (!pct) return { base, final: base, pct: 0 };
  const final = Math.round(base * (1 - pct / 100));
  return { base, final, pct };
}

function priceBlockHTML(product) {
  const { base, final, pct } = precioConOferta(product);
  if (pct > 0) {
    return `<p class="card-price"><span class="price-old">${money(base)}</span> <span class="price-new">${money(final)}</span> <span class="oferta-tag">-${pct}%</span></p>`;
  }
  return `<p class="card-price">${money(base)}</p>`;
}

// ---------- Lightbox ----------

function openLightbox(product) {
  const lb = document.getElementById("lightbox");
  const content = document.getElementById("lightboxContent");
  content.innerHTML = "";

  const media = document.createElement("div");
  if (product.video) {
    media.innerHTML = `<video src="${product.video}" controls autoplay playsinline></video>`;
  } else if (product.videoLink && isYouTube(product.videoLink)) {
    const embed = toYouTubeEmbed(product.videoLink);
    media.innerHTML = embed
      ? `<iframe width="100%" height="320" src="${embed}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="border-radius:6px;"></iframe>`
      : `<img src="${(product.images || [])[0] || ''}" alt="${product.name}">`;
  } else if (product.images && product.images.length) {
    media.innerHTML = `<img src="${product.images[0]}" alt="${product.name}">`;
  }
  content.appendChild(media);

  const info = document.createElement("div");
  info.className = "lightbox-info";
  let html = `<p class="card-name">${product.name}</p>${priceBlockHTML(product)}`;
  if (product.description) html += `<p>${product.description}</p>`;
  if (product.videoLink && !isYouTube(product.videoLink)) {
    html += `<a class="video-link-btn" href="${product.videoLink}" target="_blank" rel="noopener">▶ Ver video</a>`;
  }
  info.innerHTML = html;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "add-to-cart-btn";
  addBtn.textContent = "+ Agregar al pedido";
  addBtn.addEventListener("click", () => agregarAlCarrito(product.id));
  info.appendChild(addBtn);

  content.appendChild(info);
  lb.hidden = false;
}

function spawnSparkles(x, y, color) {
  if (REDUCED_MOTION) return;
  for (let i = 0; i < 7; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    const angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.5;
    const dist = 28 + Math.random() * 22;
    s.style.setProperty("--sx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--sy", `${Math.sin(angle) * dist}px`);
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = color;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }
}

function buildCard(product, index) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;

  const accent = accentFor(product.category || product.name || String(index));
  card.style.setProperty("--accent", accent);

  if (!REDUCED_MOTION) {
    const rot = (index % 2 === 0 ? 1 : -1) * (1.2 + (index % 3) * 0.9);
    card.style.setProperty("--rot", `${rot}deg`);
    card.style.setProperty("--dur", `${4.5 + (index % 4) * 0.6}s`);
    card.style.setProperty("--delay", `-${(index % 5) * 0.8}s`);
  }

  const pin = document.createElement("div");
  pin.className = "pin";
  card.appendChild(pin);

  const media = document.createElement("div");
  media.className = "card-media";
  const img = (product.images || [])[0];
  if (img) {
    const imgEl = document.createElement("img");
    imgEl.src = img;
    imgEl.alt = product.name || "";
    imgEl.loading = "lazy";
    media.appendChild(imgEl);
  }
  if (ofertaVigente(product) > 0) {
    const ofertaBadge = document.createElement("span");
    ofertaBadge.className = "oferta-badge";
    ofertaBadge.textContent = `-${ofertaVigente(product)}%`;
    media.appendChild(ofertaBadge);
  }
  if (product.video || product.videoLink) {
    const badge = document.createElement("span");
    badge.className = "play-badge";
    badge.textContent = "▶ video";
    media.appendChild(badge);
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <p class="card-name">${product.name || "Producto"}</p>
    ${priceBlockHTML(product)}
    ${product.category ? `<span class="card-tag">${product.category}</span>` : ""}
  `;
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "add-to-cart-btn";
  addBtn.textContent = "+ Agregar";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    agregarAlCarrito(product.id);
  });
  body.appendChild(addBtn);
  card.appendChild(body);

  card.addEventListener("click", (e) => {
    spawnSparkles(e.clientX, e.clientY, accent);
    openLightbox(product);
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openLightbox(product);
  });

  return card;
}

function buildLights(count) {
  const wrap = document.createElement("div");
  wrap.className = "lights";
  for (let i = 0; i < count; i++) {
    const light = document.createElement("span");
    light.className = "light";
    light.style.setProperty("--lc", ACCENTS[i % ACCENTS.length]);
    light.style.setProperty("--ld", `${(i % 6) * 0.35}s`);
    wrap.appendChild(light);
  }
  return wrap;
}

function renderProducts(products, isEmptyStore) {
  const linesEl = document.getElementById("lines");
  const emptyEl = document.getElementById("empty");
  linesEl.innerHTML = "";

  if (!products || products.length === 0) {
    emptyEl.hidden = !isEmptyStore;
    return;
  }
  emptyEl.hidden = true;

  const chunkSize = 6;
  let globalIndex = 0;
  const rows = [];

  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const row = document.createElement("div");
    row.className = "line-row";

    const rope = document.createElement("div");
    rope.className = "rope";
    rope.appendChild(buildLights(Math.max(4, chunk.length * 2)));
    row.appendChild(rope);

    const cards = document.createElement("div");
    cards.className = "cards";
    chunk.forEach((p) => cards.appendChild(buildCard(p, globalIndex++)));
    row.appendChild(cards);

    linesEl.appendChild(row);
    rows.push(row);
  }

  if ("IntersectionObserver" in window && !REDUCED_MOTION) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    rows.forEach((r) => io.observe(r));
  } else {
    rows.forEach((r) => r.classList.add("in-view"));
  }
}

function populateCategoryFilter(products) {
  const select = document.getElementById("categoryFilter");
  const names = CATEGORIES.length
    ? CATEGORIES.map((c) => c.nombre)
    : [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  names.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function applyFilters(allProducts) {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const cat = document.getElementById("categoryFilter").value;
  const noResultsEl = document.getElementById("noResults");

  const filtered = allProducts.filter((p) => {
    const haystack = `${p.name || ""} ${p.description || ""} ${p.category || ""}`.toLowerCase();
    const matchesQ = !q || haystack.includes(q);
    const matchesCat = !cat || p.category === cat;
    return matchesQ && matchesCat;
  });

  noResultsEl.hidden = !(allProducts.length > 0 && filtered.length === 0);
  renderProducts(filtered, allProducts.length === 0);
}

// ---------- Carrito ----------

let carrito = cargarCarrito();

function cargarCarrito() {
  try {
    return JSON.parse(localStorage.getItem("carrito") || "{}");
  } catch {
    return {};
  }
}

function guardarCarrito() {
  localStorage.setItem("carrito", JSON.stringify(carrito));
}

function agregarAlCarrito(id) {
  carrito[id] = (carrito[id] || 0) + 1;
  guardarCarrito();
  actualizarUICarrito();
}

function cambiarCantidadCarrito(id, delta) {
  carrito[id] = (carrito[id] || 0) + delta;
  if (carrito[id] <= 0) delete carrito[id];
  guardarCarrito();
  actualizarUICarrito();
}

function totalItemsCarrito() {
  return Object.values(carrito).reduce((a, b) => a + b, 0);
}

function totalSinRecargo() {
  return Object.entries(carrito).reduce((total, [id, cant]) => {
    const p = ALL_PRODUCTS.find((x) => x.id === id);
    if (!p) return total;
    return total + precioConOferta(p).final * cant;
  }, 0);
}

function recargoActual() {
  const pago = document.getElementById("cartPago").value;
  if (pago !== "credito") return 0;
  return Number((SITE && SITE.recargoCredito) || 0);
}

function totalConRecargo() {
  const subtotal = totalSinRecargo();
  const recargoPct = recargoActual();
  return subtotal * (1 + recargoPct / 100);
}

function actualizarUICarrito() {
  const count = document.getElementById("cartCount");
  count.textContent = totalItemsCarrito();
  renderCartPanel();
}

function renderCartPanel() {
  const itemsEl = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");
  const recargoNota = document.getElementById("recargoNota");

  const entries = Object.entries(carrito).filter(([id]) => ALL_PRODUCTS.some((p) => p.id === id));
  if (entries.length === 0) {
    itemsEl.innerHTML = `<p class="hint">Todavía no agregaste nada.</p>`;
  } else {
    itemsEl.innerHTML = entries
      .map(([id, cant]) => {
        const p = ALL_PRODUCTS.find((x) => x.id === id);
        if (!p) return "";
        return `
        <div class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">${p.name}</span>
            <span class="cart-item-price">${money(precioConOferta(p).final)}</span>
          </div>
          <div class="cart-item-qty">
            <button data-id="${id}" data-delta="-1">−</button>
            <span>${cant}</span>
            <button data-id="${id}" data-delta="1">+</button>
          </div>
        </div>`;
      })
      .join("");
  }

  const recargoPct = recargoActual();
  if (recargoPct > 0) {
    recargoNota.hidden = false;
    recargoNota.textContent = `Con tarjeta de crédito se suma ${recargoPct}% de recargo.`;
  } else {
    recargoNota.hidden = true;
  }

  totalEl.textContent = money(totalConRecargo());
  updateWhatsappHref();

  itemsEl.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => cambiarCantidadCarrito(btn.dataset.id, Number(btn.dataset.delta)));
  });
}

function mensajePedido() {
  const lineas = Object.entries(carrito)
    .map(([id, cant]) => {
      const p = ALL_PRODUCTS.find((x) => x.id === id);
      if (!p) return null;
      return `• ${cant} x ${p.name} — ${money(precioConOferta(p).final * cant)}`;
    })
    .filter(Boolean);

  const nombre = document.getElementById("cartNombre").value.trim();
  const entrega = document.getElementById("cartEntrega").value;
  const direccion = document.getElementById("cartDireccion").value.trim();
  const pago = document.getElementById("cartPago").value;
  const pagoLabel = { efectivo: "Efectivo", transferencia: "Transferencia", credito: "Tarjeta de crédito" }[pago];
  const recargoPct = recargoActual();
  const subtotal = totalSinRecargo();
  const totalFinal = totalConRecargo();

  let texto = `¡Hola! Quiero hacer este pedido:\n\n${lineas.join("\n")}\n\nSubtotal: ${money(subtotal)}`;
  if (recargoPct > 0) {
    texto += `\nRecargo tarjeta (${recargoPct}%): ${money(totalFinal - subtotal)}`;
  }
  texto += `\nTotal: ${money(totalFinal)}`;
  texto += `\n\nEntrega: ${entrega === "retiro" ? "Retiro en el local" : "Envío"}`;
  if (direccion) texto += `\n${entrega === "retiro" ? "Zona/aclaración" : "Dirección"}: ${direccion}`;
  texto += `\nForma de pago: ${pagoLabel}`;
  if (nombre) texto += `\nNombre: ${nombre}`;

  return encodeURIComponent(texto);
}

function updateWhatsappHref() {
  const numero = (SITE && SITE.whatsapp) || "";
  document.getElementById("cartWhatsapp").href = numero
    ? `https://wa.me/${numero.replace(/[^0-9]/g, "")}?text=${mensajePedido()}`
    : "#";
}

function actualizarLabelEntrega() {
  const entrega = document.getElementById("cartEntrega").value;
  document.getElementById("cartDireccionLabel").textContent =
    entrega === "retiro" ? "Zona o aclaración (opcional)" : "Dirección de envío";
}

function setupCartUI() {
  document.getElementById("cartFab").addEventListener("click", () => {
    document.getElementById("cartOverlay").hidden = false;
  });
  document.getElementById("cartClose").addEventListener("click", () => {
    document.getElementById("cartOverlay").hidden = true;
  });
  document.getElementById("cartOverlay").addEventListener("click", (e) => {
    if (e.target.id === "cartOverlay") e.currentTarget.hidden = true;
  });
  document.getElementById("cartNombre").addEventListener("input", updateWhatsappHref);
  document.getElementById("cartDireccion").addEventListener("input", updateWhatsappHref);
  document.getElementById("cartEntrega").addEventListener("change", () => {
    actualizarLabelEntrega();
    updateWhatsappHref();
  });
  document.getElementById("cartPago").addEventListener("change", renderCartPanel);
  actualizarLabelEntrega();
}

async function init() {
  const [site, products, categorias] = await Promise.all([
    loadJSON("site.json"),
    loadJSON("products.json"),
    loadJSON("categorias.json"),
  ]);

  SITE = site;
  CATEGORIES = categorias || [];
  applyPalette(site && site.colores);
  renderBunting();
  window.addEventListener("resize", renderBunting);
  renderSite(site);

  if (site && site.activa === false) {
    document.querySelector(".filter-bar").hidden = true;
    document.getElementById("paused").hidden = false;
    return;
  }

  const allProducts = products || [];
  ALL_PRODUCTS = allProducts;
  populateCategoryFilter(allProducts);
  applyFilters(allProducts);
  setupCartUI();
  actualizarUICarrito();

  document.getElementById("searchInput").addEventListener("input", () => applyFilters(allProducts));
  document.getElementById("categoryFilter").addEventListener("change", () => applyFilters(allProducts));

  document.getElementById("lightboxClose").addEventListener("click", () => {
    document.getElementById("lightbox").hidden = true;
    document.getElementById("lightboxContent").innerHTML = "";
  });
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox") {
      e.currentTarget.hidden = true;
      document.getElementById("lightboxContent").innerHTML = "";
    }
  });
}

init();
