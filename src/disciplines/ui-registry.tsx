"use client";
import type { ComponentType } from "react";
import { FootballFields } from "./football/fields";
import type { DisciplineScope } from "@/lib/disciplines/types";
export type DisciplineFieldsProps = { teamId: string; scope: Exclude<DisciplineScope,"section">; activityId?: string; personId?: string; readOnly?: boolean };
export const disciplineFieldEditors: Readonly<Record<string,ComponentType<DisciplineFieldsProps>>> = { football: FootballFields };
