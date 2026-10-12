import { expect,it,vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation",()=>({usePathname:()=>"/o/aik"}));
vi.mock("./floating-assistant",()=>({FloatingAssistant:()=>createElement("button",null,"Assistentknapp")}));
vi.mock("./notification-settings",()=>({NotificationSettings:()=>null}));
vi.mock("./system-admin-link",()=>({SystemAdminLink:()=>null}));
vi.mock("./logout-button",()=>({LogoutButton:()=>null}));
vi.mock("./workspace-switcher",()=>({WorkspaceSwitcher:()=>null}));
import { AppShell } from "./app-shell";
import { AppMenuContent } from "./app-header";
const organization={id:"club",slug:"aik",name:"AIK",assistantName:"Assistent"};
it("hides the assistant button and shared menu links for logged-out visitors",()=>{
 const html=renderToStaticMarkup(AppShell({organization,children:null}));
 expect(html).not.toContain("Assistentknapp");expect(html).not.toContain('/o/aik/memories');expect(html).not.toContain('has-assistant');
 expect(renderToStaticMarkup(AppMenuContent({organization}))).not.toContain('/o/aik/memories');
});
it("shows the assistant button and shared menu links for a signed-in public visitor",()=>{
 const props={organization,accountEmail:"admin@example.com"};
 const html=renderToStaticMarkup(AppShell({...props,children:null}));
 expect(html).toContain("Assistentknapp");expect(html).toContain('/o/aik/memories');expect(html).toContain('has-assistant');
 expect(renderToStaticMarkup(AppMenuContent(props))).toContain('/o/aik/memories');
});
