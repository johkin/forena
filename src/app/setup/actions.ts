"use server";
import { createOwnClub } from "@/app/club-administration-actions";
import type { ClubSetupState } from "@/lib/club-administration";
export async function createWorkspace(state: ClubSetupState, formData: FormData) { return createOwnClub(state, formData); }
