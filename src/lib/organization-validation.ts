import { z } from "zod";

const name = z.string().trim().min(2).max(120);
const slug = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const organizationCreateSchema = z.object({ name, slug: slug.optional() }).strict();
export const organizationUpdateSchema = z.object({ name: name.optional(), slug: slug.optional() }).strict().refine((value) => Object.keys(value).length > 0);
export const organizationPolicyUpdateSchema = z.object({ managerDefaultScope: z.enum(["TEAM", "ORGANIZATION"]) }).strict();
export const organizationInvitationCreateSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(320)), role: z.enum(["ADMIN", "MANAGER", "MEMBER"]) }).strict();
export const organizationInvitationAcceptSchema = z.object({ token: z.string().min(40).max(128) }).strict();
export const organizationMembershipUpdateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
export const organizationTransferSchema = z.object({ targetMembershipId: z.string().min(1).max(128) }).strict();

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
