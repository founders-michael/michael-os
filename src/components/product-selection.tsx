import Link from "next/link";
import { ArrowRight, Building2, Leaf, LockKeyhole } from "lucide-react";
import BrandLogo from "@/components/brand-logo";
import { productChoices, type ProductExperience } from "@/lib/product-entry";
import AssistantHero from "@/components/assistant-hero";

export default function ProductSelection({ authenticatedName, authenticated: authenticatedProp, availableProducts, accessDenied = false }: {
  authenticatedName?: string;
  authenticated?: boolean;
  availableProducts?: readonly ProductExperience[];
  accessDenied?: boolean;
}) {
  const authenticated = authenticatedProp ?? Boolean(authenticatedName);
  const visibleProductIds = availableProducts ?? (authenticated ? [] : ["lifestyle", "work"]);
  const visibleProducts = productChoices.filter((product) => visibleProductIds.includes(product.id));

  return (
    <main className="product-entry-page">
      <div className="product-entry-wrap">
        <header className="product-entry-header">
          <Link href="/" aria-label="MichaelOS home"><BrandLogo /></Link>
          <span><LockKeyhole size={14} /> One identity. Separate spaces.</span>
        </header>

        {/*
          * Anonymous visitors see the assistant first: it is what the product
          * is. A signed-in user has already chosen Michael and is here to pick
          * a space, so they keep the chooser heading and skip the pitch.
          */}
        {authenticated
          ? <section className="product-entry-intro" aria-labelledby="product-entry-title">
              <p className="product-entry-kicker">{`WELCOME${authenticatedName ? `, ${authenticatedName}` : " BACK"}`}</p>
              <h1 id="product-entry-title">Choose the space<br className="product-entry-break" /> that fits your day.</h1>
              <p className="product-entry-lede">Start with the experience you came for. You can choose the other one later; your personal and organization data always stay separate.</p>
            </section>
          : <AssistantHero />}

        {accessDenied && <p role="alert" className="product-entry-lede">You don’t have access to that product. Choose an available product or contact your administrator.</p>}
        {!authenticated && <div className="product-entry-divider">
          <h2 id="product-entry-choose">Michael works in two spaces</h2>
          <p>Your personal and organization data always stay separate.</p>
        </div>}
        <section className="product-choice-grid" aria-labelledby={authenticated ? undefined : "product-entry-choose"} aria-label={authenticated ? "Choose a product" : undefined}>
          {visibleProducts.map((product) => {
            const isWork = product.id === "work";
            const Icon = isWork ? Building2 : Leaf;
            const href = authenticated
              ? (isWork ? "/work" : "/lifestyle")
              : product.loginHref;

            return (
              <article key={product.id} className={`product-choice-card ${isWork ? "product-choice-work" : "product-choice-lifestyle"}`}>
                <div className="product-choice-icon"><Icon size={22} strokeWidth={1.7} /></div>
                <p className="product-choice-eyebrow">{isWork ? "FOR ORGANIZATIONS" : "FOR YOUR LIFE"}</p>
                <h2>{product.name}</h2>
                <p className="product-choice-tagline">{product.description}</p>
                <p className="product-choice-copy">{product.supportingText}</p>
                {isWork && <p className="product-choice-note">WorkOS is in its foundation phase. Organization setup and invitations are available now.</p>}
                <div className="product-choice-actions">
                  <Link className="product-choice-primary" href={href}>
                    {authenticated
                      ? (isWork ? "Open WorkOS" : "Continue with LifestyleOS")
                      : (isWork ? "Continue with WorkOS" : "Continue with LifestyleOS")}
                    <ArrowRight size={17} />
                  </Link>
                  {!authenticated && <Link className="product-choice-secondary" href={product.registerHref}>Create an account</Link>}
                  {authenticated && isWork && <Link className="product-choice-secondary" href="/accept-invitation">Have an invitation? Accept it</Link>}
                </div>
              </article>
            );
          })}
          {visibleProducts.length === 0 && <p role="status" className="product-entry-lede">No product access is currently assigned to this account. Contact your MichaelOS administrator.</p>}
        </section>

        <footer className="product-entry-footer">Your personal plans are private to you. Organization access is checked separately for every workspace.</footer>
      </div>
    </main>
  );
}
