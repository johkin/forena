export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureInitialSystemAdminInvite } = await import("./lib/platform-admin-bootstrap");
    const result = await ensureInitialSystemAdminInvite();
    if (result.status === "invited") {
      console.info("[bootstrap] initial system admin invitation sent", { email: result.email });
    }
  } catch (error) {
    console.error("[bootstrap] initial system admin bootstrap failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
