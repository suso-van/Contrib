/**
 * Normalizes escaped markdown and raw HTML tags emitted by LLM into standard Markdown.
 */
export function normalizeEscapedMarkdown(text) {
  if (typeof text !== 'string') return text || '';

  let out = text;

  // 1. Strip dangling unclosed HTML tag at end of text (e.g. `<a href=` or `<p`)
  out = out.replace(/<[a-zA-Z]+(?:\s+[^>]*?)?$/i, '');

  // 2. Preformatted code blocks: <pre><code class="language-js">...</code></pre>
  out = out.replace(/<pre><code(?:\s+class=["'](?:language-)?([a-zA-Z0-9_-]+)["'])?>([\s\S]*?)<\/code><\/pre>/gi, (_match, lang, code) => {
    const language = lang || '';
    return `\n\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n\n`;
  });

  // Plain <pre><code>...</code></pre> without lang
  out = out.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n');
  out = out.replace(/<pre>([\s\S]*?)<\/pre>/gi, '\n\n```\n$1\n```\n\n');

  // 3. Inline code <code>...</code>
  out = out.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');

  // 4. Headings (both escaped like \<h1> and unescaped like <h1>)
  out = out.replace(/\\*<h1\b[^>]*>([\s\S]*?)(?:\\*<\/h1>|$)/gi, '\n\n# $1\n\n');
  out = out.replace(/\\*<h2\b[^>]*>([\s\S]*?)(?:\\*<\/h2>|$)/gi, '\n\n## $1\n\n');
  out = out.replace(/\\*<h3\b[^>]*>([\s\S]*?)(?:\\*<\/h3>|$)/gi, '\n\n### $1\n\n');
  out = out.replace(/\\*<h4\b[^>]*>([\s\S]*?)(?:\\*<\/h4>|$)/gi, '\n\n#### $1\n\n');
  out = out.replace(/\\*<h5\b[^>]*>([\s\S]*?)(?:\\*<\/h5>|$)/gi, '\n\n##### $1\n\n');
  out = out.replace(/\\*<h6\b[^>]*>([\s\S]*?)(?:\\*<\/h6>|$)/gi, '\n\n###### $1\n\n');

  // 5. Strong / Bold / Em / Italic
  out = out.replace(/\\*<(?:strong|b)\b[^>]*>([\s\S]*?)(?:\\*<\/(?:strong|b)>|$)/gi, '**$1**');
  out = out.replace(/\\*<(?:em|i)\b[^>]*>([\s\S]*?)(?:\\*<\/(?:em|i)>|$)/gi, '*$1*');

  // 6. Links: <a href="url">text</a>
  out = out.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)(?:<\/a>|$)/gi, (_match, url, label) => {
    return label ? `[${label}](${url})` : url;
  });

  // 7. Paragraphs (handles closed and unclosed <p>)
  out = out.replace(/<\/?p\b[^>]*>/gi, '\n\n');

  // 8. Lists
  out = out.replace(/<li\b[^>]*>([\s\S]*?)(?:<\/li>|$)/gi, '\n- $1');
  out = out.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n');

  // 9. Line breaks and horizontal rules
  out = out.replace(/\\*<br\s*\/?>/gi, '\n');
  out = out.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // 10. Clean up any remaining isolated raw HTML tags (e.g. </div>, <span>)
  out = out.replace(/<\/?(?:div|span|section|article|header|footer)\b[^>]*>/gi, '');

  // 11. Normalize excessive newlines
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}
