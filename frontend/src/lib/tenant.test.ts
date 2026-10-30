import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferTenantBaseFromHost,
  readTenantSlugFromHost,
  tenantBaseDomain,
  tenantSubdomainLabel,
  tenantWorkspaceUrl,
} from "./tenant";

describe("inferTenantBaseFromHost", () => {
  it("returns apex for two-label hosts", () => {
    expect(inferTenantBaseFromHost("ijaaro.online")).toBe("ijaaro.online");
  });

  it("strips the first label for tenant hosts", () => {
    expect(inferTenantBaseFromHost("hodan-properties.ijaaro.online")).toBe(
      "ijaaro.online",
    );
  });

  it("ignores localhost and vercel hosts", () => {
    expect(inferTenantBaseFromHost("hodan.localhost")).toBeNull();
    expect(inferTenantBaseFromHost("ijaaro-project.vercel.app")).toBeNull();
  });
});

describe("readTenantSlugFromHost", () => {
  it("reads slug from production subdomain without env", () => {
    expect(readTenantSlugFromHost("hodan-properties.ijaaro.online")).toBe(
      "hodan-properties",
    );
  });

  it("returns null on apex and reserved www", () => {
    expect(readTenantSlugFromHost("ijaaro.online")).toBeNull();
    expect(readTenantSlugFromHost("www.ijaaro.online")).toBeNull();
  });

  it("reads local SaaS hosts", () => {
    expect(readTenantSlugFromHost("hodan.localhost")).toBe("hodan");
  });
});

describe("tenantWorkspaceUrl / labels with live host", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds slug.ijaaro.online when the app is on the apex", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "ijaaro.online",
        protocol: "https:",
        port: "",
        origin: "https://ijaaro.online",
      },
    });

    expect(tenantBaseDomain()).toBe("ijaaro.online");
    expect(tenantWorkspaceUrl("hodan-properties")).toBe(
      "https://hodan-properties.ijaaro.online",
    );
    expect(tenantSubdomainLabel("hodan-properties")).toBe(
      "hodan-properties.ijaaro.online",
    );
  });

  it("builds slug.ijaaro.online on vercel.app hosts via prod default", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "ijaaro-project.vercel.app",
        protocol: "https:",
        port: "",
        origin: "https://ijaaro-project.vercel.app",
      },
    });
    vi.stubEnv("PROD", true);

    // Managed preview host cannot be inferred; production default still wins.
    expect(tenantWorkspaceUrl("mcc")).toMatch(/mcc\.ijaaro\.online$/);
  });
});
