// Historical names remain searchable and share one project filter.
const PROJECT_GROUPS = [
  ["3D Art", "3d-work"],
  ["AIA Tennis"],
  ["Asset Showcase Studio"],
  ["Charge Grid"],
  ["Charge Knights"],
  ["Code Review Simulator", "CRS", "Godot Asset Authoring"],
  ["Conventional Space Fleet"],
  ["Hallowmere"],
  ["Hold the Line"],
  ["Horizon Charge"],
  ["Horizon Charge II: Sunward", "horizon-charge-ii", "horizon-charge-2"],
  ["Incremental Framework", "incremental_framework", "Upgrade Loop", "Pebble Run"],
  ["Jev"],
  ["Material Atlas"],
  ["Plug & Prosper", "plug-charge", "Plug and Prosper"],
  ["Rogue Diner Coop"],
  ["Supper Guard"],
  ["The Hollow Signal"],
  ["Unnamed Card Game", "unnamed-game"],
  ["Wheat Sway Lab"],
  ["White Approach", "fog-mountain"],
  ["Who Put Sugar in the Sky?", "Odd Spark"],
  ["World State Simulator"],
];

function nameKey(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const projectsByName = new Map();
PROJECT_GROUPS.forEach((group) => {
  group.forEach((name) => projectsByName.set(nameKey(name), group));
});

export function displayProject(project) {
  const known = projectsByName.get(nameKey(project));
  if (known) return known[0];
  return project.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function projectKey(project) {
  return nameKey(displayProject(project));
}

export function projectSearchText(project) {
  return (projectsByName.get(nameKey(project)) || [project])
    .flatMap((name) => [name, nameKey(name), nameKey(name).replaceAll(" ", "-")])
    .join(" ");
}

export function projectOptions(posts) {
  const projects = new Map();
  posts.forEach((post) => projects.set(projectKey(post.project), displayProject(post.project)));
  return [...projects].sort((a, b) => a[1].localeCompare(b[1]));
}
