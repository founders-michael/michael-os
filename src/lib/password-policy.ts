export const passwordRequirements = [
  { id: "length", label: "At least 12 characters", test: (password: string) => password.length >= 12 },
  { id: "uppercase", label: "One uppercase letter (A–Z)", test: (password: string) => /[A-Z]/.test(password) },
  { id: "lowercase", label: "One lowercase letter (a–z)", test: (password: string) => /[a-z]/.test(password) },
] as const;

export function getPasswordRequirementState(password: string) {
  return passwordRequirements.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    met: requirement.test(password),
  }));
}

export function meetsPasswordPolicy(password: string) {
  return password.length <= 128 && passwordRequirements.every((requirement) => requirement.test(password));
}
