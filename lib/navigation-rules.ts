export function getDefaultHomePath(roles: string[]) {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("vendor")) return "/vendor";
  return "/";
}

export function getHeaderNavigation(roles: string[]) {
  const isAdmin = roles.includes("admin");
  const isUser = roles.includes("user");

  return {
    showAdminDashboard: isAdmin,
    showAreaSelect: isUser,
    showSearch: isUser,
    showOrders: isUser,
    showCart: isUser,
  };
}
