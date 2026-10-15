// Shared by the server layout and the client ThemeToggle, so it must not be a "use client" module.

export const THEME_KEY = "al-rahm:theme";

// Browser/status-bar colour for each theme (matches --surface in globals.css).
export const THEME_COLORS = { light: "#ffffff", dark: "#1c191b" };

// Runs in <head> before the page paints, so a saved choice never flashes the wrong theme.
// With no saved choice the app follows the device's light/dark setting.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
