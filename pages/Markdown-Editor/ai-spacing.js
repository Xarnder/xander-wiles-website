/** Remove empty gaps between list items without changing other Markdown spacing. */
export function compactAiBulletSpacing(markdown) {
    const lines = String(markdown ?? '').match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
    return compactAiBulletLines(lines).join('');
}

/**
 * Lines retain their original newline bytes. Add-only callers supply a predicate
 * so even when a gap contains both old and new lines, only new blanks are removed.
 */
export function compactAiBulletLines(lines, canRemove = () => true) {
    let fence = null;
    let comment = false;
    const firstContent = lines.slice(1).find(line => line.trim()) || '';
    const frontMatterEnd = lines[0]?.trim() === '---' && /^[\w.-]+[ \t]*:/.test(firstContent.trim())
        ? lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)$/.test(line.trim())) : -1;
    let item = null;
    const info = lines.map((raw, index) => {
        let body = raw.replace(/[\r\n]+$/, '');
        let quoteDepth = 0;
        while (/^[ \t]*>/.test(body)) {
            body = body.replace(/^[ \t]*>[ \t]?/, '');
            quoteDepth += 1;
        }
        const trimmed = body.trim();
        const protectedLine = { quoteDepth, blank: false, item: false, bullet: false };
        if (index <= frontMatterEnd) return protectedLine;
        const ticks = body.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (ticks && quoteDepth === fence.quoteDepth && ticks[1][0] === fence.char &&
                ticks[1].length >= fence.length && !ticks[2].trim()) fence = null;
            return protectedLine;
        }
        if (comment || trimmed.startsWith('<!--')) {
            comment = !body.includes('-->');
            item = null;
            return protectedLine;
        }
        if (ticks) {
            fence = { char: ticks[1][0], length: ticks[1].length, quoteDepth };
            item = null;
            return protectedLine;
        }
        if (!trimmed.replace(/[\s\u200B\uFEFF]/g, '')) return { ...protectedLine, blank: true };
        const indent = (body.match(/^[ \t]*/)?.[0] || '').replace(/\t/g, '    ').length;
        const marker = body.match(/^[ \t]*(?:[-*+]|\d+[.)])([ \t]+)(\S.*)$/);
        const rule = /^(?:[-*_][ \t]*){3,}$/.test(trimmed);
        const inList = item && item.quoteDepth === quoteDepth;
        // Four-space code at the top level (or deeply indented code within an item)
        // can contain list-looking text. Leave that code's blank lines intact.
        if (marker && !rule && (indent < 4 || (inList && indent < item.contentIndent + 4))) {
            const prefix = body.slice(0, body.length - marker[2].length);
            item = { quoteDepth, contentIndent: prefix.replace(/\t/g, '    ').length };
            return { ...protectedLine, item: true, bullet: true };
        }
        if (inList && indent >= item.contentIndent && indent < item.contentIndent + 4 &&
            !rule && !/^#{1,6}\s/.test(trimmed) && !trimmed.includes('|')) {
            return { ...protectedLine, item: true };
        }
        item = null;
        return protectedLine;
    });
    const remove = new Set();
    for (let i = 0; i < info.length; i += 1) {
        if (!info[i].blank) continue;
        const start = i;
        while (i < info.length && info[i].blank) i += 1;
        const left = info[start - 1];
        const right = info[i];
        if (!left?.item || !right?.bullet || left.quoteDepth !== right.quoteDepth) continue;
        // Unprefixed blank lines between blockquotes separate different quote blocks.
        if (!info.slice(start, i).every(line => line.quoteDepth === left.quoteDepth)) continue;
        for (let gap = start; gap < i; gap += 1) if (canRemove(gap)) remove.add(gap);
    }
    return lines.filter((_, index) => !remove.has(index));
}
