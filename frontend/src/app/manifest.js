// Lets the web app be installed to a phone's home screen and open full-screen like a native app.
export default function manifest() {
  return {
    name: "Al-Rahm: Women's health AI safety",
    short_name: "Al-Rahm",
    description: "Test whether AI health chatbots give safe answers to women's health questions.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f8",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
