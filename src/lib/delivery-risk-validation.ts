import { z } from "zod";

export const deliveryRiskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
}).strict();

export type DeliveryRiskListQuery = z.infer<typeof deliveryRiskListQuerySchema>;
