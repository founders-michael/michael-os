import test from "node:test";
import assert from "node:assert/strict";

import { absoluteUrl, siteUrl, siteUrlObject } from "./site-url";

function withSiteUrl<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
}

test("site origin falls back to localhost when unset or blank", () => {
  assert.equal(withSiteUrl(undefined, siteUrl), "http://localhost:3000");
  assert.equal(withSiteUrl("   ", siteUrl), "http://localhost:3000");
});

test("site origin drops any path, query or trailing slash", () => {
  assert.equal(withSiteUrl("https://michaelos.app/", siteUrl), "https://michaelos.app");
  assert.equal(withSiteUrl("https://michaelos.app/marketing?a=1", siteUrl), "https://michaelos.app");
});

test("an unparseable origin falls back rather than throwing at module load", () => {
  assert.equal(withSiteUrl("not a url", siteUrl), "http://localhost:3000");
});

test("metadataBase is a URL object for the configured origin", () => {
  const base = withSiteUrl("https://michaelos.app", siteUrlObject);
  assert.ok(base instanceof URL);
  assert.equal(base.origin, "https://michaelos.app");
});

test("absolute URLs resolve against the origin, not the current path", () => {
  withSiteUrl("https://michaelos.app", () => {
    assert.equal(absoluteUrl("/"), "https://michaelos.app/");
    assert.equal(absoluteUrl("/sitemap.xml"), "https://michaelos.app/sitemap.xml");
    assert.equal(absoluteUrl("/michael-logo.png"), "https://michaelos.app/michael-logo.png");
  });
});
