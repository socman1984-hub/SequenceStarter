// Builds CHANGELOG.md from releases.json (the same notes the app's What's new shows),
// and stamps each script and stylesheet link in the pages with its file's contents.
// Run before every push:  node tools/changelog.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const rel = JSON.parse(fs.readFileSync(path.join(root, 'releases.json'), 'utf8'));
const label = { new: 'New', better: 'Better', fixed: 'Fixed' };
let md = '# What\'s new\n\nRelease notes for SequenceStarter, newest first. The same list is in the app under **✨ What\'s new**.\n';
for (const r of rel) {
    md += `\n## ${r.version} — ${r.title}\n\n_${r.date}_\n\n`;
    for (const [t, text] of r.items) md += `- **${label[t] || t}:** ${text}\n`;
}
fs.writeFileSync(path.join(root, 'CHANGELOG.md'), md);
console.log('CHANGELOG.md written:', rel.length, 'releases');

// GitHub Pages lets browsers keep files for 10 minutes, so right after a push a
// page could load the new index.html with the old app.js. A changed file gets a
// new address (a hash of its contents), so the new page fetches it.
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 8);
let stamped = 0;
for (const page of ['index.html', 'tutorial.html']) {
    const file = path.join(root, page);
    const html = fs.readFileSync(file, 'utf8');
    const out = html.replace(/(<(?:script|link)\b[^>]*\b(?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
        (_, pre, f) => { stamped++; return `${pre}${f}?v=${hash(f)}"`; });
    if (out !== html) fs.writeFileSync(file, out);
}
console.log('Script and stylesheet links stamped:', stamped);
