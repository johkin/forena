import { describe, expect, it } from "vitest";
import { attendanceNames } from "./attendance-names";

describe("attendanceNames", () => {
  it("uses first names until they conflict, then adds a surname initial", () => {
    const names = attendanceNames([
      { personId: "1", displayName: "Johan Kindgren" },
      { personId: "2", displayName: "Johan Sandberg" },
      { personId: "3", displayName: "Elsa Kindgren" },
    ]);
    expect([...names.values()]).toEqual(["Johan K", "Johan S", "Elsa"]);
  });

  it("uses full names when initials still collide", () => {
    const names = attendanceNames([
      { personId: "1", displayName: "Johan Kindgren" },
      { personId: "2", displayName: "Johan Karlsson" },
    ]);
    expect([...names.values()]).toEqual(["Johan Kindgren", "Johan Karlsson"]);
  });
});
