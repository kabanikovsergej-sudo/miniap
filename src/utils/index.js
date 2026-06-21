export function createPageUrl(pageName) {
  return `/${String(pageName).toLowerCase()}`; // оставить как есть, если точно HashRouter
}
