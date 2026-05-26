export function getDefaultHomePath(roles: string[]) {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("vendor")) return "/vendor";
  return "/";
}

export function getHeaderNavigation(roles: string[]) {
  const isAdmin = roles.includes("admin");

  return {
    showAdminDashboard: isAdmin,
    showCart: true,
    showOrders: true,
  };
}
