import { z } from "zod"
import { Intention } from "./schema.ts"

export const RouteMotCle = z.object({
  motCle: z.string().trim().min(1).max(300),
  campagneId: z.string().regex(/^\d+$/).optional(),
  groupeId: z.string().regex(/^\d+$/).optional(),
}).strict()
export type RouteMotCle = z.infer<typeof RouteMotCle>

export const Ciblage = z.object({
  intention: Intention,
  revision: z.string().min(1).max(100),
  routes: z.array(RouteMotCle).min(1).max(2000),
}).strict()
export type Ciblage = z.infer<typeof Ciblage>
