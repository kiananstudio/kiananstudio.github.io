from pathlib import Path

p = Path('bibika/text-page-blocks.js')
s = p.read_text()
old = """      const data = await response.json();
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (!page || page.type === 'categories') return;
"""
new = """      const data = await response.json();
      const product = (Array.isArray(data?.products) ? data.products : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (product && (String(product.category || '') === 'unity-tools' || String(product.category || '') === '3d-assets')) {
        const host = q('#managed-page-content');
        if (host) qa('.managed-extra-block', host).forEach(node => node.remove());
        return;
      }
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (!page || page.type === 'categories') return;
"""
if old not in s:
    raise SystemExit('preview marker not found')
p.write_text(s.replace(old, new, 1))

p = Path('bibika/_worker.js')
s = p.read_text().replace('/text-page-blocks.js?v=1', '/text-page-blocks.js?v=2')
p.write_text(s)
