"use client";
import { checkClubSlug } from "@/app/club-administration-actions";
import { ClubSlugInput } from "./club-slug-input";
import type { ComponentProps } from "react";

export function ClubSlugField(props: Omit<ComponentProps<typeof ClubSlugInput>, "checkAvailability">) {
  return <ClubSlugInput {...props} checkAvailability={checkClubSlug} />;
}
