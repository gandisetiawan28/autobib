"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
function formatInitials(given) {
    if (!given)
        return '';
    // Split by space or hyphens, grab first letter, uppercase it, append dot
    return given.split(/[\s-]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + '.').join(' ');
}
function formatAuthorsAPA(authors) {
    if (!authors || authors.length === 0)
        return 'Unknown';
    if (authors.length === 1)
        return `${authors[0].family || authors[0].literal || 'Unknown'}, ${formatInitials(authors[0].given)}`;
    const formatted = authors.map(a => `${a.family || a.literal || 'Unknown'}, ${formatInitials(a.given)}`);
    const last = formatted.pop();
    return `${formatted.join(', ')}, & ${last}`;
}
function toTitleCase(str) {
    if (!str)
        return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}
function formatAPA(item) {
    const authors = formatAuthorsAPA(item.author || []);
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    const title = item.title ?? 'Untitled';
    const journal = toTitleCase(item['container-title'] ?? item.publisher ?? '');
    const vol = item.volume ? `, <i>${item.volume}</i>` : '';
    const iss = item.issue ? `(${item.issue})` : '';
    const pages = item.page ? `, ${item.page}` : '';
    const doi = item.DOI ? ` https://doi.org/${item.DOI}` : '';
    return `<p style="margin-left: 36pt; text-indent: -36pt; margin-bottom: 12pt;">${authors} (${year}). ${title}. <i>${journal}</i>${vol}${iss}${pages}.${doi}</p>`;
}
function formatMLA(item) {
    const author = item.author?.[0];
    const authorStr = author ? `${author.family || author.literal}, ${author.given || ''}` : 'Unknown';
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    const title = item.title ?? 'Untitled';
    const journal = toTitleCase(item['container-title'] ?? item.publisher ?? '');
    return `<p style="margin-left: 36pt; text-indent: -36pt; margin-bottom: 12pt;">${authorStr}. "${title}." <i>${journal}</i>, ${item.volume ?? ''}(${item.issue ?? ''}), ${year}, pp. ${item.page ?? 'n/a'}.</p>`;
}
function formatChicago(item) {
    const authors = (item.author || [])
        .map(a => `${a.family || a.literal || 'Unknown'}, ${a.given || ''}`)
        .join(', ');
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    const title = item.title ?? 'Untitled';
    const journal = toTitleCase(item['container-title'] ?? item.publisher ?? '');
    const doi = item.DOI ? ` https://doi.org/${item.DOI}` : '';
    return `<p style="margin-left: 36pt; text-indent: -36pt; margin-bottom: 12pt;">${authors}. "${title}." <i>${journal}</i> ${item.volume ?? ''}(${year}): ${item.page ?? 'n/a'}.${doi}</p>`;
}
function formatIEEE(item, index) {
    const authors = (item.author || [])
        .map(a => `${formatInitials(a.given)} ${a.family || a.literal || 'Unknown'}`)
        .join(', ');
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    const title = item.title ?? 'Untitled';
    const journal = toTitleCase(item['container-title'] ?? item.publisher ?? '');
    return `<p style="margin-bottom: 12pt;">[${index}] ${authors}, "${title}," <i>${journal}</i>, vol. ${item.volume ?? 'n/a'}, no. ${item.issue ?? 'n/a'}, pp. ${item.page ?? 'n/a'}, ${year}.</p>`;
}
function formatInline(item) {
    const authors = item.author || [];
    const year = item.issued?.['date-parts']?.[0]?.[0] ?? 'n.d.';
    if (authors.length === 0) {
        return `(Unknown, ${year})`;
    }
    else if (authors.length === 1) {
        const lastName = authors[0].family || authors[0].literal || 'Unknown';
        return `(${lastName}, ${year})`;
    }
    else if (authors.length === 2) {
        const lastName1 = authors[0].family || authors[0].literal || 'Unknown';
        const lastName2 = authors[1].family || authors[1].literal || 'Unknown';
        return `(${lastName1} & ${lastName2}, ${year})`;
    }
    else {
        const lastName1 = authors[0].family || authors[0].literal || 'Unknown';
        return `(${lastName1} et al., ${year})`;
    }
}
// ── POST /citation/format ─────────────────────────────────────
router.post('/format', (req, res, next) => {
    try {
        const { documents, format = 'apa' } = req.body;
        if (!Array.isArray(documents) || !documents.length)
            return next((0, error_middleware_1.createError)('documents array is required', 400));
        const formatted = documents.map((doc, i) => {
            switch (format) {
                case 'mla': return { citation: formatMLA(doc), inline: formatInline(doc) };
                case 'chicago': return { citation: formatChicago(doc), inline: formatInline(doc) };
                case 'ieee': return { citation: formatIEEE(doc, i + 1), inline: `[${i + 1}]` };
                default: return { citation: formatAPA(doc), inline: formatInline(doc) };
            }
        });
        res.json({ success: true, formatted, format });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=citation.route.js.map