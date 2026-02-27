import { Document, Element, Window } from "happy-dom";
import type {
  GiteListing,
  GiteReview,
  GiteHost,
  GiteCapacity,
  GiteEquipment,
  GiteLocation,
  GitePrice,
} from "./schema";

function parseHtml(html: string): Document {
  const window = new Window({ url: "https://www.gites-de-france.com/" });
  window.document.documentElement.innerHTML = html;
  return window.document as unknown as Document;
}

function text(el: Element | null): string {
  return el?.textContent?.trim() ?? "";
}

function parseRef(doc: Document): string {
  const detail = doc.querySelector(".g2f-accommodationHeader-detail");
  const match = text(detail).match(/Ref\s*:\s*(\S+)/);
  return match?.[1] ?? "";
}

function parseTitle(doc: Document): string {
  return text(doc.querySelector("h1.g2f-accommodationHeader-title"));
}

function parseType(doc: Document): string {
  return text(doc.querySelector("h3.g2f-accommodationHeader-type"));
}

function parseQuality(doc: Document): number {
  // Count the number of <li> elements inside .g2f-levelEpis
  const epis = doc.querySelectorAll(".g2f-levelEpis li");
  return epis.length;
}

function ellipsisText(el: Element): string {
  const p = el.querySelector("p");
  if (!p) return "";
  const innerHTML = p.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  return innerHTML.replace(/<[^>]+>/g, "").trim().replace(/\n{3,}/g, "\n\n");
}

function parseSummary(doc: Document): string {
  // First ellipsis container: the short tagline paragraph above the property wrapper.
  const el = doc.querySelector(".g2f-js-ellipsis-container");
  return el ? ellipsisText(el) : "";
}

function parseDescription(doc: Document): string {
  // Ellipsis container immediately after fiscalIntro: the detailed layout description.
  const fiscal = doc.querySelector(".g2f-accommodationProperty-fiscalIntro");
  const el = fiscal?.nextElementSibling?.classList.contains("g2f-js-ellipsis-container")
    ? fiscal.nextElementSibling
    : null;
  return el ? ellipsisText(el) : "";
}

function parseUrl(doc: Document): string {
  return doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
}

function parsePhotos(doc: Document): string[] {
  // Use the gallery panel — each <li> has an <img> with a src
  const imgs = doc.querySelectorAll("#\\30  .g2f-gallery-photos-img img, .g2f-gallery-photos-img img");
  const seen = new Set<string>();
  const urls: string[] = [];
  const base = "https://www.gites-de-france.com";
  for (const img of imgs) {
    // Prefer the largest srcset entry
    const srcset = img.getAttribute("srcset") ?? "";
    const entries = srcset
      .split(",")
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p.length >= 1);
    // Pick the last (largest) srcset url, fall back to src
    let url = entries.at(-1)?.[0] ?? img.getAttribute("src") ?? "";
    if (url && url.startsWith("/")) url = base + url;
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function parseLocation(doc: Document): GiteLocation {
  // Region and department from the detail line: "Ref : X | in CITY - Dept"
  const detail = text(doc.querySelector(".g2f-accommodationHeader-detail"));
  // Normalize whitespace (the HTML has a newline + spaces before " - Department")
  const normalizedDetail = detail.replace(/\s+/g, " ");
  // Split on the LAST " - " to handle hyphenated city names like SAINT-ROMAIN-EN-JAREZ
  const inMatch = normalizedDetail.match(/in\s+(.+)/);
  const afterIn = inMatch?.[1] ?? "";
  const lastDashIdx = afterIn.lastIndexOf(" - ");
  const city = lastDashIdx >= 0 ? afterIn.slice(0, lastDashIdx).trim() : afterIn.trim();
  const department = lastDashIdx >= 0 ? afterIn.slice(lastDashIdx + 3).trim() : "";

  // Region from dataLayer — search all inline scripts
  let dlScript = "";
  for (const s of doc.querySelectorAll("script:not([src])")) {
    if (s.textContent?.includes("lodgeRegion")) {
      dlScript = s.textContent;
      break;
    }
  }
  const regionMatch = dlScript.match(/"lodgeRegion"\s*:\s*"([^"]+)"/);
  const regionRaw = regionMatch?.[1] ?? "";
  // Unescape Unicode escape sequences (e.g. \u00f4 → ô) from JSON-encoded strings
  const region = regionRaw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Lat/lng from the map div
  const mapEl = doc.querySelector("#map-accommodation");
  const lat = mapEl?.getAttribute("data-lat");
  const lng = mapEl?.getAttribute("data-lng");

  return {
    city,
    department,
    region,
    ...(lat ? { latitude: parseFloat(lat) } : {}),
    ...(lng ? { longitude: parseFloat(lng) } : {}),
  };
}

function parseCapacity(doc: Document): GiteCapacity {
  const items = doc.querySelector(".g2f-accommodationHeader-capacity");

  const valueOf = (cls: string): string =>
    text(items?.querySelector(`li.${cls} .capacity-value`) ?? null);

  const people = parseInt(valueOf("people")) || 0;
  const bedrooms = parseInt(valueOf("room")) || 0;
  const surfaceRaw = valueOf("surface");
  const surfaceM2 = surfaceRaw ? parseInt(surfaceRaw) : undefined;

  const wifi = !!items?.querySelector("li.wifi svg.wifi");
  const petsAccepted = !items?.querySelector("li.no-pets");
  const category = text(items?.querySelector("li.house .capacity-value") ?? null) || undefined;

  return { people, bedrooms, surfaceM2, wifi, petsAccepted, category };
}

function parseEquipment(doc: Document): GiteEquipment {
  const sections = doc.querySelectorAll("#equipment .g2f-accommodationServices");

  const listItems = (section: Element): string[] =>
    Array.from(section.querySelectorAll("ul.g2f-list-bullet li span")).map(
      (s) => text(s)
    );

  let indoor: string[] = [];
  let outdoor: string[] = [];
  let services: string[] = [];

  for (const section of sections) {
    const heading = text(section.querySelector("h3")).toLowerCase();
    if (heading.includes("indoor")) indoor = listItems(section);
    else if (heading.includes("outdoor")) outdoor = listItems(section);
    else if (heading.includes("services")) services = listItems(section);
  }

  return { indoor, outdoor, services };
}

function parsePriceIncludes(doc: Document): string[] {
  const line = doc.querySelector(".g2f-contactCard-line");
  if (!line) return [];

  // Remove the <strong> heading
  const strong = line.querySelector("strong");
  const headingText = strong?.textContent ?? "";

  // Replace <br> with newlines to split on them
  // Clone the element so we can manipulate it
  const clone = line.cloneNode(true) as Element;
  clone.querySelector("strong")?.remove();

  // Get innerHTML and replace <br> tags with newline markers
  const innerHTML = clone.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  const plainText = innerHTML.replace(/<[^>]+>/g, "").trim();

  // Check if content is bullet-style (lines starting with "- ")
  if (plainText.includes("\n") || plainText.startsWith("- ")) {
    // Split on newlines, strip leading "- ", filter blanks
    return plainText
      .split("\n")
      .map((s) => s.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
  }

  // Otherwise comma-separated
  return plainText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePrice(doc: Document): GitePrice {
  const ldJson = doc.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
  const priceMatch = ldJson.match(/"price"\s*:\s*"?([\d.]+)"?/);
  const currencyMatch = ldJson.match(/"priceCurrency"\s*:\s*"([^"]+)"/);
  const baseAmount = parseFloat(priceMatch?.[1] ?? "0");
  const currency = currencyMatch?.[1] ?? "EUR";

  // Guest houses (B&Bs) always price per-night in the JSON-LD.
  const isGuestHouse = !!doc.querySelector("h3.g2f-accommodationHeader-type")
    ?.textContent?.toLowerCase().includes("guest house");
  if (isGuestHouse) {
    return { amount: baseAmount, currency, per: "night" };
  }

  // Whole-housing listings using the native booking form also have a per-night
  // JSON-LD price (the "from" base rate shown without dates).
  const isWidget = !!doc.querySelector(".g2f-accommodationSticky-details-widget");
  if (!isWidget) {
    return { amount: baseAmount, currency, per: "night" };
  }

  // Whole-housing listings using the ITEA widget expose a per-week price in
  // the JSON-LD. Divide by data-nbj (number of nights, always 7 for our search)
  // to get the per-night rate.
  const nbj = parseInt(
    doc.querySelector("[data-nbj]")?.getAttribute("data-nbj") ?? "0"
  );
  const amount = nbj > 0 ? Math.round((baseAmount / nbj) * 100) / 100 : baseAmount;
  return { amount, currency, per: "night" };
}

function parseAllInclusive(doc: Document): boolean {
  return !!doc.querySelector(".g2f-cartouche-all-inclusive");
}

function parseAggregateRating(doc: Document): { value: number; count: number } {
  const ldJson = doc.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
  const valueMatch = ldJson.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/);
  const countMatch = ldJson.match(/"ratingCount"\s*:\s*"?(\d+)"?/);
  return {
    value: parseFloat(valueMatch?.[1] ?? "0"),
    count: parseInt(countMatch?.[1] ?? "0"),
  };
}

function parseCriteriaRating(wrap: Element, label: string): number | undefined {
  const items = wrap.querySelectorAll(".g2f-accommodationCom-criteria-list li");
  for (const item of items) {
    const criteriaText = text(item.querySelector(".criteria")).toLowerCase();
    if (criteriaText.includes(label.toLowerCase())) {
      const ratingText = item.textContent ?? "";
      const match = ratingText.match(/([\d.]+)\s*\/\s*5/);
      if (match) return parseFloat(match[1]!);
    }
  }
  return undefined;
}

function parseReviews(doc: Document): GiteReview[] {
  const reviews: GiteReview[] = [];
  const items = doc.querySelectorAll(".g2f-accommodationReview");

  for (const item of items) {
    const author = text(item.querySelector("figcaption strong")).replace(/^\s*/, "");

    const times = item.querySelectorAll("time");
    const stayFrom = text(times[0]!);
    const stayTo = text(times[1]!);

    const title = text(item.querySelector("h3 strong"));

    const ratingText = text(item.querySelector(".criteria-wrap"));
    const ratingMatch = ratingText.match(/([\d.]+)\s*\/\s*5/);
    const rating = parseFloat(ratingMatch?.[1] ?? "0");

    // Body: the <p> tags in the content, excluding the stay dates and posted-on paragraphs
    const bodyPs = item.querySelectorAll(".g2f-accommodationReview-content > p");
    const body = Array.from(bodyPs)
      .map((p) => text(p))
      .filter((t) => t && !t.startsWith("Stay from") && !t.startsWith("Posted on"))
      .join("\n");

    const postedEl = item.querySelector(".g2f-accommodationReview-date, .g2f-accommodationCom-date");
    const postedRaw = text(postedEl);
    const postedOn = postedRaw.replace(/Posted on\s*/i, "").trim();

    const criteria = {
      cleanliness: parseCriteriaRating(item, "cleanliness"),
      comfort: parseCriteriaRating(item, "comfort"),
      welcome: parseCriteriaRating(item, "welcome"),
      value: parseCriteriaRating(item, "value"),
    };

    const replyBubble = item.querySelector(".g2f-accommodationCom-bubble");
    let ownerReply: GiteReview["ownerReply"] = undefined;
    if (replyBubble) {
      const replyText = text(replyBubble.querySelector("p"));
      const replyAuthor = text(replyBubble.querySelector(".g2f-accommodationCom-bubble-author strong"));
      ownerReply = { text: replyText, author: replyAuthor };
    }

    reviews.push({ author, stayFrom, stayTo, title, rating, body, postedOn, criteria, ownerReply });
  }

  return reviews;
}

function parseHost(doc: Document): GiteHost {
  const hostSection = doc.querySelector(".g2f-accommodationHost");

  const name = text(hostSection?.querySelector(".g2f-accommodationHost-hostname") ?? null)
    .trim();

  const langEl = hostSection?.querySelector(".g2f-contactCard-profil-language");
  const langText = text(langEl!);
  // "Spoken languages : French"
  const langsRaw = langText.replace(/Spoken languages\s*:\s*/i, "").trim();
  const spokenLanguages = langsRaw
    .split(/[,;]/)
    .map((l) => l.trim())
    .filter(Boolean);

  const certifiedEl = hostSection?.querySelector(".g2f-contactCard-profil-certified");
  // Sibling text node after the <strong>: "since 2017"
  const certifiedText = text(certifiedEl?.parentElement ?? null);
  const sinceMatch = certifiedText.match(/since\s+(\d{4})/i);
  const approvedSince = sinceMatch ? parseInt(sinceMatch[1]!) : undefined;

  return { name, spokenLanguages, approvedSince };
}

function parseAdvertType(doc: Document): GiteListing["advertType"] {
  const advertEl = doc.querySelector("section > div > p > em");
  const advertText = text(advertEl).toLowerCase();
  if (advertText.includes("individual")) return "individual";
  if (advertText.includes("professional")) return "professional";
  return undefined;
}

export function parseGiteListing(html: string): GiteListing {
  const doc = parseHtml(html);

  const summary = parseSummary(doc) || undefined;
  const descriptionRaw = parseDescription(doc);
  // Avoid duplicating the summary in description when there's only one ellipsis container.
  const description = descriptionRaw && descriptionRaw !== summary ? descriptionRaw : undefined;

  return {
    ref: parseRef(doc),
    title: parseTitle(doc),
    type: parseType(doc),
    quality: parseQuality(doc),
    summary,
    description,
    url: parseUrl(doc),
    photos: parsePhotos(doc),
    location: parseLocation(doc),
    capacity: parseCapacity(doc),
    equipment: parseEquipment(doc),
    priceIncludes: parsePriceIncludes(doc),
    price: parsePrice(doc),
    allInclusive: parseAllInclusive(doc),
    aggregateRating: parseAggregateRating(doc),
    reviews: parseReviews(doc),
    host: parseHost(doc),
    advertType: parseAdvertType(doc),
  };
}
