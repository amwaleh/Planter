const basePath = import.meta.env.BASE_URL;

export function appHref(path = "/"): string {
  const relativePath = path.replace(/^\/+/, "");
  return `${basePath}${relativePath}`;
}

export function currentAppPath(): string {
  const normalizedBase = basePath.replace(/\/+$/, "");
  let path = window.location.pathname;
  if (normalizedBase && path.startsWith(normalizedBase)) {
    path = path.slice(normalizedBase.length);
  }
  return path.replace(/\/+$/, "") || "/";
}
