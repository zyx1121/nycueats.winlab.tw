export function getDefaultHomePath(roles: string[]) {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("vendor")) return "/vendor";
  return "/";
}

export function getHeaderNavigation(roles: string[]) {
  const isVendor = roles.includes("vendor");
  const isAdmin = roles.includes("admin");

  return {
    showVendorDashboard: isVendor,
    showAdminDashboard: isAdmin,
    showOrderCatalog: isVendor || isAdmin,
    showCart: true,
    showOrders: true,
  };
}
