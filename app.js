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
  document.title = site.nombre || "Tienda";
  document.getElementById("siteName").textContent = site.nombre || "Mi Tienda";
  document.getElementById("siteTagline").textContent = site.eslogan || "";

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
}

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
  let html = `<p class="card-name">${product.name}</p><p class="card-price">${product.price || ""}</p>`;
  if (product.condicion) {
    html += `<span class="card-tag ${product.condicion}">${product.condicion === "nuevo" ? "Nuevo" : "Usado"}</span>`;
  }
  if (product.description) html += `<p>${product.description}</p>`;
  if (product.videoLink && !isYouTube(product.videoLink)) {
    html += `<a class="video-link-btn" href="${product.videoLink}" target="_blank" rel="noopener">▶ Ver video</a>`;
  }
  info.innerHTML = html;
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
  if (product.condicion) {
    const condBadge = document.createElement("span");
    condBadge.className = "condition-badge " + product.condicion;
    condBadge.textContent = product.condicion === "nuevo" ? "Nuevo" : "Usado";
    media.appendChild(condBadge);
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
    <p class="card-price">${product.price || ""}</p>
    ${product.category ? `<span class="card-tag">${product.category}</span>` : ""}
  `;
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
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function applyFilters(allProducts) {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const cat = document.getElementById("categoryFilter").value;
  const cond = document.getElementById("conditionFilter").value;
  const noResultsEl = document.getElementById("noResults");

  const filtered = allProducts.filter((p) => {
    const haystack = `${p.name || ""} ${p.description || ""} ${p.category || ""}`.toLowerCase();
    const matchesQ = !q || haystack.includes(q);
    const matchesCat = !cat || p.category === cat;
    const matchesCond = !cond || p.condicion === cond;
    return matchesQ && matchesCat && matchesCond;
  });

  noResultsEl.hidden = !(allProducts.length > 0 && filtered.length === 0);
  renderProducts(filtered, allProducts.length === 0);
}

async function init() {
  const [site, products] = await Promise.all([
    loadJSON("site.json"),
    loadJSON("products.json"),
  ]);

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
  populateCategoryFilter(allProducts);
  applyFilters(allProducts);

  document.getElementById("searchInput").addEventListener("input", () => applyFilters(allProducts));
  document.getElementById("categoryFilter").addEventListener("change", () => applyFilters(allProducts));
  document.getElementById("conditionFilter").addEventListener("change", () => applyFilters(allProducts));

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
