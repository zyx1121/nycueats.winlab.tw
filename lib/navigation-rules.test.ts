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

  it("only shows admin dashboard button for admin accounts", () => {
    expect(getHeaderNavigation(["user"])).toMatchObject({ showAdminDashboard: false });
    expect(getHeaderNavigation(["vendor"])).toMatchObject({ showAdminDashboard: false });
    expect(getHeaderNavigation(["admin"])).toMatchObject({ showAdminDashboard: true });
    expect(getHeaderNavigation(["vendor", "admin"])).toMatchObject({ showAdminDashboard: true });
  });

  it("shows the vendor dashboard button for vendor accounts", () => {
    expect(getHeaderNavigation(["user"])).toMatchObject({ showVendorDashboard: false });
    expect(getHeaderNavigation(["vendor"])).toMatchObject({ showVendorDashboard: true });
    expect(getHeaderNavigation(["user", "vendor"])).toMatchObject({ showVendorDashboard: true });
    expect(getHeaderNavigation(["vendor", "admin"])).toMatchObject({ showVendorDashboard: true });
  });

  it("shows employee features only for user role", () => {
    const employeeFeatures = { showAreaSelect: true, showSearch: true, showOrders: true, showCart: true };
    const hiddenFeatures = { showAreaSelect: false, showSearch: false, showOrders: false, showCart: false };

    expect(getHeaderNavigation(["user"])).toMatchObject(employeeFeatures);
    expect(getHeaderNavigation(["vendor"])).toMatchObject(hiddenFeatures);
    expect(getHeaderNavigation(["admin"])).toMatchObject(hiddenFeatures);
    expect(getHeaderNavigation([])).toMatchObject(hiddenFeatures);
  });

  it("preserves employee features when user also holds vendor or admin role", () => {
    const employeeFeatures = { showAreaSelect: true, showSearch: true, showOrders: true, showCart: true };

    expect(getHeaderNavigation(["user", "vendor"])).toMatchObject(employeeFeatures);
    expect(getHeaderNavigation(["user", "admin"])).toMatchObject(employeeFeatures);
    expect(getHeaderNavigation(["user", "vendor", "admin"])).toMatchObject(employeeFeatures);
  });
});
