import { cache } from "@/services/cache";
import { appSession } from "@/services/session";
import sheetTheme from "./sheetTheme";

type Theme = "dark" | "light";

export class Themes {
    private themes: Theme[] = ["dark", "light"];

    private applyTheme(key?: Theme) {
        if (key === "dark") document.documentElement.classList.add("dark");
        else if (key === "light") document.documentElement.classList.remove("dark");

        // The sheet palette follows the app theme, so it has to be rewritten
        // whenever the theme changes.
        sheetTheme.apply();
    }

    public setTheme(key: Theme = "light") {
        this.applyTheme(key);

        cache.set("config", "theme", key);
        if (appSession.user.settings) {
            appSession.user.settings.theme = key;
        }
    }

    public async load() {
        let theme = await cache.get("config", "theme");
        if (theme === undefined) {
            theme = appSession.user.settings?.theme;
        }
        this.applyTheme(theme as unknown as undefined | Theme);
        await sheetTheme.load();
    }

    public get keys() {
        return this.themes;
    }
}

const themes = new Themes();

export default themes;
