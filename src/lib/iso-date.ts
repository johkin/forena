import { z } from "zod";

export const isoDateSchema = z.iso.date().refine(value => !value.startsWith("0000-"));
