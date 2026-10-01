/** Validation of developer-supplied app settings. */
import { z } from "zod";
import { validateOrigin, validateRedirectUri } from "./core";

export const MAX_APPS_PER_USER = 10;

const httpsUrl = z
  .string()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "URL https attendue.");

export const appFields = {
  name: z.string().trim().min(2, "Nom trop court.").max(60, "Nom trop long."),
  homepageUrl: httpsUrl,
  iconUrl: httpsUrl.nullable().optional(),
  redirectUris: z.array(z.string().refine(validateRedirectUri, "URI de redirection invalide (https, ou http sur localhost).")).min(1, "Au moins une URI de redirection.").max(10),
  allowedOrigins: z.array(z.string().refine(validateOrigin, "Origine invalide (ex. https://monsite.fr).")).max(10).default([]),
};

export const createAppSchema = z.object({ ...appFields, confidential: z.boolean().default(false) });
export const updateAppSchema = z.object(appFields).partial().refine((b) => Object.keys(b).length > 0, "Aucun champ à modifier.");
