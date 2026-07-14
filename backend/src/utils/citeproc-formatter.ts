/**
 * citeproc-formatter.ts
 * Utility untuk memformat CSL JSON menjadi teks bibliografi berformat akademik
 * menggunakan citeproc-js (CSL processor standar industri).
 *
 * Mendukung gaya: APA 7th, IEEE, Chicago, Vancouver, dll.
 */

// @ts-ignore — citeproc tidak punya @types di npm, gunakan require
const CSL = require('citeproc');
import path from 'path';
import fs from 'fs';

// ── Cache style CSL (agar tidak re-load dari disk setiap call) ──
const styleCache = new Map<string, string>();

/**
 * Load CSL style dari file lokal.
 * Fallback ke APA 7th jika style tidak ditemukan.
 */
function loadStyle(styleName: string): string {
  if (styleCache.has(styleName)) return styleCache.get(styleName)!;

  // Cari di node_modules/citation-style-language-styles (populer) atau bundled styles
  const candidates = [
    path.join(__dirname, '../assets/csl', `${styleName}.csl`),
    path.join(process.cwd(), 'assets/csl', `${styleName}.csl`),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      styleCache.set(styleName, content);
      return content;
    }
  }

  // Fallback: APA 7th minimal built-in
  const apaFallback = getBuiltinApaStyle();
  styleCache.set(styleName, apaFallback);
  return apaFallback;
}

/**
 * Format daftar CSL JSON menjadi bibliography string.
 *
 * @param items   - Array CSL JSON items (setiap item harus punya property `id`)
 * @param locale  - Locale string (default: 'id-ID' untuk Bahasa Indonesia)
 * @param style   - Nama gaya CSL (default: 'apa' untuk APA 7th)
 * @returns Object berisi `bibliography` (array string) dan `inlineCitations` (map id → inline)
 */
export function formatBibliography(
  items: Record<string, any>[],
  locale: string = 'id-ID',
  style: string = 'apa'
): { bibliography: string[]; inlineCitations: Record<string, string> } {
  try {
    // Pastikan setiap item punya ID
    const itemsWithId = items.map((item, idx) => ({
      ...item,
      id: item.id ?? `ref_${idx}`,
    }));

    const cslData: Record<string, any> = {};
    for (const item of itemsWithId) {
      cslData[item.id] = item;
    }

    const citeprocSys = {
      retrieveLocale: (_lang: string) => getBuiltinLocale(),
      retrieveItem: (id: string) => cslData[id],
    };

    const cslStyle = loadStyle(style);
    const citeproc = new CSL.Engine(citeprocSys, cslStyle);

    // Daftarkan semua item
    citeproc.updateItems(itemsWithId.map((i) => i.id));

    // Generate bibliography
    const bibResult = citeproc.makeBibliography();
    const bibEntries: string[] = bibResult[1] ?? [];

    // Generate inline citations
    const inlineCitations: Record<string, string> = {};
    for (const item of itemsWithId) {
      try {
        const result = citeproc.appendCitationCluster(
          {
            citationID: `cite_${item.id}`,
            citationItems: [{ id: item.id }],
            properties: { noteIndex: 0 },
          },
          [],
          []
        );
        if (result[0]?.[0]?.[1]) {
          inlineCitations[item.id] = result[0][0][1];
        }
      } catch {
        // skip individual citation error
      }
    }

    return {
      bibliography: bibEntries.map((b) =>
        b.replace(/<[^>]+>/g, '').trim() // strip HTML tags from output
      ),
      inlineCitations,
    };
  } catch (err) {
    console.error('[citeproc-formatter] Error:', err);
    // Fallback: return formatted strings manually
    return {
      bibliography: items.map(fallbackFormat),
      inlineCitations: {},
    };
  }
}

/**
 * Fallback formatter sederhana (APA-like) jika citeproc gagal.
 */
function fallbackFormat(item: Record<string, any>): string {
  const authors = (item.author ?? [])
    .map((a: any) => `${a.family ?? ''}, ${(a.given ?? '')[0] ?? ''}.`)
    .join(', ');
  const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
  const title = item.title ?? 'Unknown Title';
  const journal = item['container-title'] ? ` ${item['container-title']},` : '';
  const volume = item.volume ? ` ${item.volume}` : '';
  const issue = item.issue ? `(${item.issue})` : '';
  const page = item.page ? `, ${item.page}` : '';
  const doi = item.DOI ? ` https://doi.org/${item.DOI}` : '';
  return `${authors} (${year}). ${title}.${journal}${volume}${issue}${page}.${doi}`;
}

// ── Built-in minimal CSL & locale (agar tidak perlu file eksternal) ──

function getBuiltinLocale(): string {
  // Locale minimal untuk id-ID / en-US
  return `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="id-ID">
  <terms>
    <term name="and">dan</term>
    <term name="et-al">et al.</term>
    <term name="editor"><single>editor</single><multiple>editor</multiple></term>
    <term name="translator"><single>penerjemah</single><multiple>penerjemah</multiple></term>
    <term name="no date">tanpa tanggal</term>
    <term name="no date" form="short">t.t.</term>
    <term name="retrieved">diakses</term>
    <term name="from">dari</term>
  </terms>
</locale>`;
}

function getBuiltinApaStyle(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" demote-non-dropping-particle="sort-only">
  <info>
    <title>AutoBib APA 7th (Built-in)</title>
    <id>http://www.zotero.org/styles/apa</id>
    <updated>2023-01-01T00:00:00+00:00</updated>
  </info>
  <macro name="author">
    <names variable="author">
      <name name-as-sort-order="all" and="symbol" sort-separator=", " initialize-with=". " delimiter=", " delimiter-precedes-last="always"/>
      <label form="short" prefix=" (" suffix=")"/>
      <et-al term="et-al" min-names="3" use-first="1"/>
    </names>
  </macro>
  <macro name="issued">
    <choose>
      <if variable="issued">
        <date variable="issued"><date-part name="year"/></date>
      </if>
      <else><text term="no date" form="short"/></else>
    </choose>
  </macro>
  <macro name="title">
    <text variable="title" font-style="italic"/>
  </macro>
  <citation et-al-min="3" et-al-use-first="1" disambiguate-add-year-suffix="true" collapse="year">
    <sort><key macro="author"/><key macro="issued"/></sort>
    <layout prefix="(" suffix=")" delimiter="; ">
      <group delimiter=", ">
        <text macro="author"/>
        <text macro="issued"/>
      </group>
    </layout>
  </citation>
  <bibliography hanging-indent="true" entry-spacing="0">
    <sort><key macro="author"/><key macro="issued"/></sort>
    <layout suffix=".">
      <group delimiter=" ">
        <text macro="author"/>
        <text macro="issued" prefix="(" suffix=")."/>
        <text macro="title" suffix="."/>
        <choose>
          <if type="article-journal">
            <group delimiter=", ">
              <text variable="container-title" font-style="italic"/>
              <text variable="volume" font-style="italic"/>
              <group><text variable="issue" prefix="(" suffix=")"/></group>
              <text variable="page"/>
            </group>
            <text variable="DOI" prefix=" https://doi.org/"/>
          </if>
          <else>
            <text variable="publisher"/>
          </else>
        </choose>
      </group>
    </layout>
  </bibliography>
</style>`;
}
