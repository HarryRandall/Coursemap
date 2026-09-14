import { z } from "zod";

export const catalogueSectionReviewSchema = z.array(
  z.object({
    key: z.string(),
    approved: z.boolean(),
    eligible: z.boolean(),
    reason: z.string().optional(),
    method: z.string().nullable(),
    reviewedAt: z.string().nullable(),
  }),
);
export type CatalogueSectionReview = z.infer<
  typeof catalogueSectionReviewSchema
>;
