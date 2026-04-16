import { describe, expect, it } from "vitest";

import { getDefaultHomePath, getHeaderNavigation } from "@/lib/navigation-rules";

describe("navigation rules", () => {
  it("routes pure vendors to the vendor dashboard by default", () => {
    expect(getDefaultHomePath(["vendor"])).toBe("/vendor");
  });

  it("routes pure admins to the admin dashboard by default", () => {
    expect(getDefaultHomePath(["admin"])).toBe("/admin");
  });

  it("keeps users on the ordering homepage", () => {
    expect(getDefaultHomePath(["user"])).toBe("/");
  });

  it("prioritizes vendor over user and admin over vendor", () => {
    expect(getDefaultHomePath(["vendor", "user"])).toBe("/vendor");
    expect(getDefaultHomePath(["admin", "user"])).toBe("/admin");
    expect(getDefaultHomePath(["vendor", "admin"])).toBe("/admin");
    expect(getDefaultHomePath(["vendor", "admin", "user"])).toBe("/admin");
  });

  it("shows 點餐目錄 for vendor and admin accounts", () => {
    expect(getHeaderNavigation(["user"])).toMatchObject({
      showOrderCatalog: false,
      showVendorDashboard: false,
      showAdminDashboard: false,
    });
    expect(getHeaderNavigation(["admin"])).toMatchObject({
      showOrderCatalog: true,
      showVendorDashboard: false,
      showAdminDashboard: true,
    });
    expect(getHeaderNavigation(["vendor"])).toMatchObject({
      showOrderCatalog: true,
      showVendorDashboard: true,
      showAdminDashboard: false,
    });
    expect(getHeaderNavigation(["vendor", "admin"])).toMatchObject({
      showOrderCatalog: true,
      showVendorDashboard: true,
      showAdminDashboard: true,
    });
  });

  it("keeps cart and orders visible for all logged-in roles", () => {
    expect(getHeaderNavigation(["user"])).toMatchObject({
      showCart: true,
      showOrders: true,
    });
    expect(getHeaderNavigation(["vendor"])).toMatchObject({
      showCart: true,
      showOrders: true,
    });
  });
});
