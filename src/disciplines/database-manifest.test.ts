import { expect,it } from "vitest";
import { readFileSync,writeFileSync } from "node:fs";
import { footballPackage } from "./football/definition";
it("keeps the installed database manifest aligned with the package",()=>{
  const manifest={key:footballPackage.key,version:footballPackage.version,schemas:footballPackage.schemas,
    capabilities:footballPackage.capabilities,...footballPackage.storage};
  const path="src/disciplines/football/database-manifest.json";
  if(process.env.WRITE_DISCIPLINE_MANIFEST==="1") writeFileSync(path,JSON.stringify(manifest,null,2)+"\n");
  expect(JSON.parse(readFileSync(path,"utf8"))).toEqual(manifest);
  const sql=readFileSync("supabase/migrations/20261008125135_discipline_lifecycle_and_package_adapters.sql","utf8");
  const seed=sql.match(/values \('football','1.0.0','([^']+)'\)/)?.[1];
  expect(seed).toBeDefined();
  expect(JSON.parse(seed!)).toEqual(manifest);
});
