export type ProductExperience = "lifestyle" | "work";
export type AuthMode = "login" | "register";

export const productChoices = [
  {
    id: "lifestyle",
    name: "LifestyleOS",
    description: "Your personal operating system.",
    supportingText:
      "Plan your life, manage your goals, build habits, organize your calendar, and create realistic daily routines.",
    loginHref: "/lifestyle/login",
    registerHref: "/lifestyle/register",
  },
  {
    id: "work",
    name: "WorkOS",
    description: "Your organization's operating system.",
    supportingText:
      "Create an organization or join one by invitation. Projects, assignments, and team planning are coming in later milestones.",
    loginHref: "/work/login",
    registerHref: "/work/register",
  },
] as const;

export function productAuthHref(product: ProductExperience, mode: AuthMode, returnTo?: string) {
  const href = `/${product}/${mode}`;
  return returnTo ? `${href}?returnTo=${encodeURIComponent(returnTo)}` : href;
}

/** Fixed post-auth destinations: product choice affects navigation, never access rights. */
export function productAuthDestination(product: ProductExperience, mode: AuthMode) {
  if (product === "work") return "/work";
  return mode === "register" ? "/onboarding" : "/lifestyle";
}

export function signedInProductDestination(
  product: ProductExperience,
  lifestyleOnboardingComplete = false,
) {
  if (product === "work") return "/work";
  return lifestyleOnboardingComplete ? "/" : "/onboarding";
}
