import { whoAmI } from "../../lib/api";
import { getSettings, setSettings } from "../../lib/settings";

const host = document.getElementById("host") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const result = document.getElementById("result") as HTMLElement;

getSettings().then((s) => {
  host.value = s.host;
  token.value = s.token;
});

document.getElementById("save")!.addEventListener("click", async () => {
  await setSettings({ host: host.value.trim(), token: token.value.trim() });
  result.textContent = "testing...";
  result.className = "muted";
  try {
    const me = await whoAmI();
    result.textContent = `Connected as ${me.name ?? me.email} (${me.role}).`;
    result.className = "ok";
  } catch (err) {
    result.textContent = (err as Error).message;
    result.className = "err";
  }
});
