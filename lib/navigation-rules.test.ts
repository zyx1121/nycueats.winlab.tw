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
