// Exercise the shipped renderer without loading the feed or media controllers.
const source = await Deno.readTextFile(new URL("../site/app.js", import.meta.url));
const renderer = source.slice(source.indexOf("function renderMarkdown("), source.indexOf("\nfunction ", source.indexOf("function renderMarkdown(") + 1));
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.textContent = ""; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this[key] = value; }
}
const render = new Function("document", "appendInline", `${renderer}; return renderMarkdown;`)(
  { createElement: (tag) => new Element(tag) },
  (element, text) => { element.textContent = text; },
);
function equal(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
Deno.test("fenced code keeps whitespace and literal markup, then resumes paragraphs", () => {
  const root = render("Before\n\n```cpp\n  if (a < b) {\n\n\t// **literal** <script>\n  }\n```\n\nAfter");
  equal(root.children.length, 3);
  const pre = root.children[1];
  equal(pre.tagName, "PRE");
  equal(pre.tabIndex, 0);
  equal(pre.children[0].dataset.language, "cpp");
  equal(pre.children[0].textContent, "  if (a < b) {\n\n\t// **literal** <script>\n  }\n");
  equal(root.children[2].textContent, "After");
});
Deno.test("unclosed and empty fences retain content without interpreting it", () => {
  equal(render("```\n# title\n- item").children[0].children[0].textContent, "# title\n- item\n");
  equal(render("```\n```").children[0].children[0].textContent, "");
});
