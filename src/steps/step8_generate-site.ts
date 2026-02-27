import { createStep } from "../cache";
import type { GiteListing, GiteEnrichment, RatingComponent } from "../schema";

type EnrichedListing = GiteListing & { distanceKm: number; enrichment: GiteEnrichment };

function esc(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreBar(score: number): string {
  const pct = ((score - 1) / 9) * 100;
  const color =
    score >= 7.5 ? "#22c55e" : score >= 5.5 ? "#f59e0b" : "#ef4444";
  return `<div class="score-bar-wrap"><div class="score-bar" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>`;
}

function componentRow(label: string, c: RatingComponent): string {
  return `
    <div class="component-row">
      <span class="component-label">${esc(label)}</span>
      <span class="component-score" style="color:${c.score >= 7.5 ? "#22c55e" : c.score >= 5.5 ? "#f59e0b" : "#ef4444"}">${c.score.toFixed(1)}</span>
      ${scoreBar(c.score)}
      <span class="component-reason">${esc(c.reason)}</span>
    </div>`;
}

function epiDots(quality: number): string {
  return "◆".repeat(quality) + "◇".repeat(Math.max(0, 5 - quality));
}

function starDisplay(value: number, count: number): string {
  if (count === 0) return '<span class="no-rating">No reviews</span>';
  const filled = Math.round(value);
  const stars = "★".repeat(filled) + "☆".repeat(5 - filled);
  return `<span class="stars">${stars}</span> <span class="review-count">${value.toFixed(1)} (${count} reviews)</span>`;
}

function photoGallery(photos: string[], ref: string, lat?: number, lon?: number): string {
  if (photos.length === 0 && lat == null) return "";
  const thumbs = photos
    .slice(0, 8)
    .map(
      (url, i) =>
        `<img class="thumb${i === 0 ? " thumb-active" : ""}" src="${esc(url)}" alt="photo ${i + 1}" loading="lazy" onclick="selectPhoto(this,'${esc(url)}')">`
    )
    .join("");
  const mapDiv =
    lat != null && lon != null
      ? `<div class="map" id="map-${esc(ref)}" data-lat="${lat}" data-lon="${lon}"></div>`
      : "";
  return `
    <div class="gallery">
      ${photos.length > 0 ? `<img class="main-photo" src="${esc(photos[0])}" alt="main photo" onclick="openLightbox(this.src)">` : ""}
      ${photos.length > 0 ? `<div class="thumbs">${thumbs}</div>` : ""}
      ${mapDiv}
      ${lat != null && lon != null ? `<a class="gmaps-link" href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener">Open in Google Maps &rarr;</a>` : ""}
    </div>`;
}

function renderCard(listing: EnrichedListing, rank: number): string {
  const { enrichment } = listing;
  const { algorithmic, ai, value, finalRating } = enrichment;
  const pricePerPerson = (listing.price.amount / listing.capacity.people).toFixed(0);

  return `
  <article class="card" id="listing-${esc(listing.ref)}">
    <div class="card-header">
      <span class="rank">#${rank}</span>
      <div class="card-title-block">
        <h2 class="card-title"><a href="${esc(listing.url)}" target="_blank" rel="noopener">${esc(listing.title)}</a></h2>
        <div class="card-meta">
          <span class="location">${esc(listing.location.city)}, ${esc(listing.location.department)}, ${esc(listing.location.region)}</span>
          <span class="dot">·</span>
          <span class="distance">${listing.distanceKm.toFixed(0)} km from Amsterdam</span>
          <span class="dot">·</span>
          <span class="epis" title="${listing.quality} épis">${epiDots(listing.quality)} ${listing.quality} épis</span>
        </div>
        <div class="card-meta">
          ${starDisplay(listing.aggregateRating.value, listing.aggregateRating.count)}
          <span class="dot">·</span>
          <span class="capacity">${listing.capacity.people} people · ${listing.capacity.bedrooms} bedrooms${listing.capacity.surfaceM2 ? ` · ${listing.capacity.surfaceM2} m²` : ""}</span>
        </div>
      </div>
      <div class="final-rating-block">
        <div class="final-rating-value">${finalRating.toFixed(2)}</div>
        <div class="final-rating-label">/ 10</div>
        ${scoreBar(finalRating)}
      </div>
    </div>

    <div class="card-body">
      ${photoGallery(listing.photos, listing.ref, listing.location.latitude, listing.location.longitude)}

      <div class="card-details">
        <div class="price-block">
          <span class="price-amount">€${listing.price.amount}</span>
          <span class="price-unit">/ night</span>
          <span class="price-per-person">≈ €${pricePerPerson} / person / night</span>
          ${listing.allInclusive ? '<span class="all-inclusive">All Inclusive</span>' : ""}
        </div>

        ${listing.summary ? `<p class="summary">${esc(listing.summary)}</p>` : ""}

        <details class="scores-section">
          <summary>Score breakdown</summary>
          <div class="components">
            <div class="component-group">
              <h3>Algorithmic</h3>
              ${componentRow("Value for money", value)}
              ${componentRow("Social proof", algorithmic.socialProof)}
            </div>
            <div class="component-group">
              <h3>AI assessment</h3>
              ${componentRow("Outdoor chill potential", ai.outdoorChillPotential)}
              ${componentRow("Group comfort", ai.groupComfort)}
              ${componentRow("Location vibe", ai.locationVibe)}
              ${componentRow("Miscellaneous", ai.miscellaneous)}
            </div>
          </div>
        </details>

        ${
          listing.description
            ? `<details class="description-section">
          <summary>Full description</summary>
          <p class="description-text">${esc(listing.description)}</p>
        </details>`
            : ""
        }

        <div class="amenities">
          <div class="amenity-col">
            <strong>Indoor</strong>
            <ul>${listing.equipment.indoor.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
          </div>
          <div class="amenity-col">
            <strong>Outdoor</strong>
            <ul>${listing.equipment.outdoor.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
          </div>
          <div class="amenity-col">
            <strong>Services</strong>
            <ul>${listing.equipment.services.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
          </div>
        </div>

        ${
          listing.reviews.length > 0
            ? `<details class="reviews-section">
          <summary>Reviews (${listing.reviews.length})</summary>
          ${listing.reviews
            .slice(0, 5)
            .map(
              (r) => `
            <div class="review">
              <div class="review-header">
                <strong>${esc(r.author)}</strong>
                <span class="review-stars">${"★".repeat(Math.round(r.rating))}${"☆".repeat(5 - Math.round(r.rating))}</span>
                <span class="review-date">${esc(r.stayFrom)} – ${esc(r.stayTo)}</span>
              </div>
              <p class="review-title"><em>${esc(r.title)}</em></p>
              <p class="review-body">${esc(r.body)}</p>
              ${
                r.ownerReply
                  ? `<div class="owner-reply"><strong>${esc(r.ownerReply.author)}:</strong> ${esc(r.ownerReply.text)}</div>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </details>`
            : ""
        }

        <a class="view-listing" href="${esc(listing.url)}" target="_blank" rel="noopener">View on Gites de France &rarr;</a>
      </div>
    </div>
  </article>`;
}

function generateHtml(listings: EnrichedListing[]): string {
  const cards = listings.map((l, i) => renderCard(l, i + 1)).join("\n");
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gieter — France Trip 2026</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }

    header {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 1.5rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    header h1 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; }
    header p { font-size: 0.85rem; color: #94a3b8; margin-top: 0.2rem; }

    main { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 2rem; }

    /* Card */
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      background: #162032;
      border-bottom: 1px solid #334155;
    }

    .rank {
      font-size: 2rem;
      font-weight: 800;
      color: #475569;
      min-width: 3rem;
      line-height: 1;
      padding-top: 0.2rem;
    }

    .card-title-block { flex: 1; min-width: 0; }
    .card-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.3rem; }
    .card-title a { color: #f8fafc; text-decoration: none; }
    .card-title a:hover { color: #38bdf8; }
    .card-meta { font-size: 0.8rem; color: #94a3b8; display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin-top: 0.2rem; }
    .dot { color: #475569; }

    .epis { color: #fbbf24; font-size: 0.8rem; }
    .stars { color: #fbbf24; }
    .review-count { color: #94a3b8; }
    .no-rating { color: #475569; font-style: italic; }

    .final-rating-block { text-align: center; min-width: 80px; }
    .final-rating-value { font-size: 2.2rem; font-weight: 800; color: #f8fafc; line-height: 1; }
    .final-rating-label { font-size: 0.75rem; color: #64748b; }

    /* Score bar */
    .score-bar-wrap { background: #334155; border-radius: 4px; height: 6px; overflow: hidden; margin-top: 4px; }
    .score-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }

    /* Card body */
    .card-body { display: flex; gap: 0; flex-wrap: wrap; }
    .gallery { flex: 0 0 340px; display: flex; flex-direction: column; gap: 6px; padding: 1rem; background: #0f172a; }
    .main-photo { width: 100%; height: 220px; object-fit: cover; border-radius: 8px; cursor: zoom-in; }
    .thumbs { display: flex; gap: 4px; flex-wrap: wrap; }
    .thumb { width: 58px; height: 42px; object-fit: cover; border-radius: 4px; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; border: 2px solid transparent; }
    .thumb:hover, .thumb-active { opacity: 1; border-color: #38bdf8; }
    .map { width: 100%; height: 180px; border-radius: 8px; overflow: hidden; margin-top: 2px; z-index: 0; }
    .gmaps-link { display: block; text-align: center; font-size: 0.75rem; color: #64748b; text-decoration: none; padding: 4px 0; }
    .gmaps-link:hover { color: #38bdf8; }

    .card-details { flex: 1; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; min-width: 0; }

    /* Price */
    .price-block { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .price-amount { font-size: 1.6rem; font-weight: 700; color: #f8fafc; }
    .price-unit { color: #94a3b8; font-size: 0.9rem; }
    .price-per-person { font-size: 0.8rem; color: #64748b; margin-left: 0.5rem; }
    .all-inclusive { background: #166534; color: #86efac; font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; font-weight: 600; }

    .summary { font-size: 0.9rem; color: #cbd5e1; font-style: italic; }

    /* Score breakdown */
    details { border: 1px solid #334155; border-radius: 8px; overflow: hidden; }
    details > summary {
      padding: 0.6rem 1rem;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
      color: #94a3b8;
      background: #162032;
      list-style: none;
      user-select: none;
    }
    details > summary::-webkit-details-marker { display: none; }
    details > summary::before { content: "▶ "; font-size: 0.7rem; }
    details[open] > summary::before { content: "▼ "; }
    details > summary:hover { color: #e2e8f0; }

    .components { display: flex; gap: 1rem; padding: 1rem; flex-wrap: wrap; }
    .component-group { flex: 1; min-width: 240px; }
    .component-group h3 { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 0.75rem; }

    .component-row { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 0 0.5rem; margin-bottom: 0.9rem; }
    .component-label { font-size: 0.8rem; font-weight: 600; color: #cbd5e1; }
    .component-score { font-size: 0.9rem; font-weight: 700; text-align: right; }
    .score-bar-wrap { grid-column: 1 / -1; }
    .component-reason { grid-column: 1 / -1; font-size: 0.75rem; color: #64748b; margin-top: 2px; }

    /* Description */
    .description-text { padding: 1rem; font-size: 0.85rem; color: #cbd5e1; white-space: pre-wrap; }

    /* Amenities */
    .amenities { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8rem; }
    .amenity-col { flex: 1; min-width: 140px; }
    .amenity-col strong { display: block; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    .amenity-col ul { list-style: none; }
    .amenity-col li { color: #cbd5e1; padding: 1px 0; }
    .amenity-col li::before { content: "· "; color: #475569; }

    /* Reviews */
    .reviews-section .review { padding: 1rem; border-bottom: 1px solid #1e293b; }
    .reviews-section .review:last-child { border-bottom: none; }
    .review-header { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.3rem; font-size: 0.85rem; }
    .review-stars { color: #fbbf24; }
    .review-date { color: #64748b; font-size: 0.75rem; }
    .review-title { font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.3rem; }
    .review-body { font-size: 0.82rem; color: #cbd5e1; }
    .owner-reply { margin-top: 0.5rem; font-size: 0.8rem; color: #7dd3fc; padding-left: 1rem; border-left: 2px solid #1d4ed8; }

    .view-listing {
      display: inline-block;
      padding: 0.5rem 1.2rem;
      background: #0369a1;
      color: #f0f9ff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      align-self: flex-start;
      transition: background 0.2s;
    }
    .view-listing:hover { background: #0284c7; }

    /* Lightbox */
    #lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.92);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    #lightbox.open { display: flex; }
    #lightbox img {
      max-width: 92vw;
      max-height: 92vh;
      object-fit: contain;
      border-radius: 6px;
      box-shadow: 0 0 60px rgba(0,0,0,0.8);
    }
    #lightbox-close {
      position: fixed;
      top: 1rem;
      right: 1.5rem;
      font-size: 2rem;
      color: #e2e8f0;
      cursor: pointer;
      line-height: 1;
      user-select: none;
    }
    #lightbox-close:hover { color: #fff; }

    footer {
      text-align: center;
      color: #334155;
      font-size: 0.75rem;
      padding: 2rem;
    }

    @media (max-width: 700px) {
      .card-header { flex-wrap: wrap; }
      .gallery { flex: 0 0 100%; }
      .components { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Gieter — France Trip 2026</h1>
    <p>8 students · Week of July 20–27 · Generated ${generated} · ${listings.length} listings</p>
  </header>
  <main>
${cards}
  </main>
  <div id="lightbox" onclick="closeLightbox()">
    <span id="lightbox-close" onclick="closeLightbox()">&times;</span>
    <img id="lightbox-img" src="" alt="">
  </div>
  <footer>Generated by gieter &mdash; gites-de-france.com scraper &amp; AI analyser</footer>
  <script>
    function selectPhoto(thumb, url) {
      const card = thumb.closest('.card');
      card.querySelector('.main-photo').src = url;
      card.querySelectorAll('.thumb').forEach(t => t.classList.remove('thumb-active'));
      thumb.classList.add('thumb-active');
    }

    function openLightbox(src) {
      document.getElementById('lightbox-img').src = src;
      document.getElementById('lightbox').classList.add('open');
    }

    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('open');
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });

    document.querySelectorAll('.map[data-lat]').forEach(function(el) {
      var lat = parseFloat(el.dataset.lat);
      var lon = parseFloat(el.dataset.lon);
      var map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([lat, lon], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);
      L.circleMarker([lat, lon], { radius: 8, color: '#0369a1', fillColor: '#38bdf8', fillOpacity: 0.9, weight: 2 }).addTo(map);
    });
  </script>
</body>
</html>`;
}

const generateSite = createStep<EnrichedListing[], null>(
  "generate-site",
  "8",
  async (listings) => {
    const html = generateHtml(listings);
    await Bun.write("data/site/index.html", html);
    console.log(`Wrote data/site/index.html (${listings.length} listings)`);
    return null;
  }
);

export default generateSite;
