import { displayProject, projectKey, projectOptions, projectSearchText } from "../site/projects.js";

function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("slug and display-name backposts occupy one option and all match its filter", () => {
  const posts = ["code-review-simulator", "Code Review Simulator", " CODE_REVIEW_SIMULATOR ", "CRS"]
    .map((project) => ({ project }));
  const options = projectOptions(posts);
  equal(options, [["code review simulator", "Code Review Simulator"]]);
  equal(posts.filter((post) => projectKey(post.project) === options[0][0]).length, 4);
});

Deno.test("the fleet has one option across capitalization, whitespace and slug variants", () => {
  equal(projectOptions(["conventional-space-fleet", "Conventional Space Fleet", "conventional  space fleet"]
    .map((project) => ({ project }))), [["conventional space fleet", "Conventional Space Fleet"]]);
});

Deno.test("actual game titles collect their former repository names", () => {
  equal(displayProject("plug-charge"), "Plug & Prosper");
  equal(projectKey("Plug and Prosper"), projectKey("Plug & Prosper"));
  equal(displayProject("odd-spark"), "Who Put Sugar in the Sky?");
  equal(displayProject("fog-mountain"), "White Approach");
});

Deno.test("the run screen and upgrade prototypes share their owning project", () => {
  equal(projectOptions(["Pebble Run", "Upgrade Loop", "incremental_framework"]
    .map((project) => ({ project }))), [["incremental framework", "Incremental Framework"]]);
  equal(displayProject("Godot Asset Authoring"), "Code Review Simulator");
});

Deno.test("old project names and slugs remain searchable after backposts are renamed", () => {
  for (const [name, terms] of [
    ["Plug & Prosper", ["plug-charge", "plug charge", "plug & prosper"]],
    ["Who Put Sugar in the Sky?", ["odd spark", "odd-spark"]],
    ["Incremental Framework", ["upgrade loop", "pebble run", "incremental_framework"]],
  ]) {
    const text = projectSearchText(name).toLowerCase();
    for (const term of terms) equal(text.includes(term), true);
  }
});

Deno.test("separate games stay separate, including an unconfirmed unnamed prototype", () => {
  const names = ["Horizon Charge", "Horizon Charge II: Sunward", "Unnamed Card Game", "The Hollow Signal"];
  equal(new Set(names.map(projectKey)).size, names.length);
});

Deno.test("unregistered future projects remain visible and consolidate spelling variants", () => {
  const options = projectOptions(["New Project", "new-project", "Other Project"].map((project) => ({ project })));
  equal(options.length, 2);
  equal(new Set(options.map(([key]) => key)).size, 2);
  equal(projectKey("new-project"), projectKey("New Project"));
});
