import { expect, it, vi } from "vitest";
import { loadTeamSelectionGroups } from "./team-selection-groups";
it("restricts member reads to the selected team's groups and deduplicates members", async () => {
  const eq=vi.fn().mockReturnValue({order:async()=>({data:[{id:"g",name:"Grön"}],error:null})});
  const inside=vi.fn().mockResolvedValue({data:[{group_id:"g",person_id:"p"},{group_id:"g",person_id:"p"}],error:null});
  const from=vi.fn((table:string)=>({select:()=>table==="team_groups"?{eq}:{in:inside}}));
  const result=await loadTeamSelectionGroups({from} as unknown as Parameters<typeof loadTeamSelectionGroups>[0],"team");
  expect(eq).toHaveBeenCalledWith("team_id","team");
  expect(inside).toHaveBeenCalledWith("group_id",["g"]);
  expect(result).toEqual([{id:"g",name:"Grön",personIds:["p"]}]);
});
it("does not silently return incomplete group membership after a read failure", async () => {
  const from=vi.fn((table:string)=>({select:()=>table==="team_groups"?{eq:()=>({order:async()=>({data:[{id:"g",name:"Grön"}],error:null})})}:{in:async()=>({data:null,error:{message:"failed"}})}}));
  await expect(loadTeamSelectionGroups({from} as unknown as Parameters<typeof loadTeamSelectionGroups>[0],"team")).rejects.toThrow("medlemmar");
});
