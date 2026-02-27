import { createStep } from "../cache";

const BASE_PARAMS =
  "travelers=8&arrival=2026-07-20&departure=2026-07-27&seed=183b8e53" +
  "&f%5B0%5D=category%3A36212&f%5B1%5D=category%3A70752" +
  "&f%5B2%5D=thematics%3A70742&f%5B3%5D=thematics%3A36143&f%5B4%5D=thematics%3A36142" +
  "&f%5B5%5D=thematics%3A36141&f%5B6%5D=thematics%3A72449&f%5B7%5D=thematics%3A36145" +
  "&f%5B8%5D=thematics%3A36151&f%5B9%5D=thematics%3A36153&f%5B10%5D=thematics%3A36139" +
  "&f%5B11%5D=thematics%3A36135&f%5B12%5D=thematics%3A36136&f%5B13%5D=thematics%3A36163" +
  "&f%5B14%5D=thematics%3A72447&f%5B15%5D=thematics%3A36146&f%5B16%5D=thematics%3A36144" +
  "&f%5B17%5D=thematics%3A36137&f%5B18%5D=thematics%3A36157&f%5B19%5D=thematics%3A36159" +
  "&f%5B20%5D=thematics%3A36158&f%5B21%5D=thematics%3A36161&f%5B22%5D=thematics%3A36149" +
  "&f%5B23%5D=thematics%3A36155&f%5B24%5D=thematics%3A36154&f%5B25%5D=thematics%3A36160" +
  "&f%5B26%5D=thematics%3A36156&f%5B27%5D=thematics%3A36150&f%5B28%5D=thematics%3A36162" +
  "&f%5B29%5D=thematics%3A36138&f%5B30%5D=thematics%3A36152&f%5B31%5D=thematics%3A70744";

const LAST_PAGE = 46;
const BASE_URL = "https://www.gites-de-france.com";
const LISTING_RE = /href="(\/en\/[^"]+\?from=[^"]+)"/g;

async function fetchPage(page: number): Promise<string> {
  const pageParam = page === 0 ? "" : `&page=${page}`;
  const url = `${BASE_URL}/en/search?${BASE_PARAMS}${pageParam}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for page ${page}`);
  return res.text();
}

function extractListingUrls(html: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = LISTING_RE.exec(html)) !== null) {
    urls.push(BASE_URL + match[1]!.replaceAll("&amp;", "&"));
  }
  return urls;
}

export default createStep<void, string[]>("fetch-urls", "2", async () => {
  const seen = new Set<string>();
  const allUrls: string[] = [];

  for (let page = 0; page <= LAST_PAGE; page++) {
    process.stderr.write(`Fetching page ${page}/${LAST_PAGE}...\n`);
    const html = await fetchPage(page);
    const urls = extractListingUrls(html);
    process.stderr.write(`Found ${[...new Set(urls)].length} listings on page ${page}.\n`);

    for (const url of urls) {
      const path = new URL(url).pathname;
      if (!seen.has(path)) {
        seen.add(path);
        allUrls.push(url);
      }
    }
    if (page === 2) break;
  }

  process.stderr.write(`\nFound ${allUrls.length} unique listings.\n`);
  return allUrls;
});
