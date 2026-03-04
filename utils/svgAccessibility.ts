/**
 * SVG Accessibility Utilities (WCAG 1.1.1)
 *
 * Injects <title> and <desc> into SVG strings for screen reader support.
 */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function injectSvgA11y(svg: string, title: string, desc?: string): string {
  const a11yBlock = `<title>${escapeXml(title)}</title>${desc ? `<desc>${escapeXml(desc)}</desc>` : ''}`;
  return svg.replace(/<svg([^>]*)>/, `<svg$1 role="img">${a11yBlock}`);
}
