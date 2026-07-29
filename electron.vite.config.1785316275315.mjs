// electron.vite.config.ts
import { resolve } from "path";
import { existsSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import vueDevTools from "vite-plugin-vue-devtools";
var __electron_vite_injected_dirname = "G:\\programming\\nodejs\\sessionBox";
function getEditor() {
  const editor = process.env.VUE_EDITOR || "code";
  if (process.platform === "win32" && (editor === "code" || editor === "vscode")) {
    const possiblePaths = [
      resolve(process.env.USERPROFILE || "", "AppData/Local/Programs/Microsoft VS Code/bin/code.cmd"),
      resolve("C:/Program Files/Microsoft VS Code/bin/code.cmd"),
      resolve("C:/Program Files (x86)/Microsoft VS Code/bin/code.cmd")
    ];
    for (const p of possiblePaths) {
      if (existsSync(p)) return p;
    }
  }
  return editor;
}
var isProduction = process.env.NODE_ENV === "production";
function copyChromeExtensionPreload() {
  return {
    name: "copy-chrome-extension-preload",
    closeBundle() {
      const src = resolve(__electron_vite_injected_dirname, "node_modules/electron-chrome-extensions/dist/chrome-extension-api.preload.js");
      const destDir = resolve(__electron_vite_injected_dirname, "out/preload");
      const dest = resolve(destDir, "chrome-extension-api.preload.js");
      if (existsSync(src)) {
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        copyFileSync(src, dest);
        console.log("[copy-chrome-extension-preload] Copied to out/preload/");
      } else {
        console.warn("[copy-chrome-extension-preload] Source not found:", src);
      }
    }
  };
}
function copyDebuggerWindowHtml() {
  return {
    name: "copy-debugger-window-html",
    closeBundle() {
      const destDir = resolve(__electron_vite_injected_dirname, "out/preload");
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      const htmlSrc = resolve(__electron_vite_injected_dirname, "electron/debugger-window.html");
      if (existsSync(htmlSrc)) {
        copyFileSync(htmlSrc, resolve(destDir, "debugger-window.html"));
      }
      const replayHtmlSrc = resolve(__electron_vite_injected_dirname, "electron/debugger-replay.html");
      if (existsSync(replayHtmlSrc)) {
        copyFileSync(replayHtmlSrc, resolve(destDir, "debugger-replay.html"));
      }
      const assetsDir = resolve(__electron_vite_injected_dirname, "electron/debugger-assets");
      const destAssetsDir = resolve(destDir, "debugger-assets");
      if (existsSync(assetsDir)) {
        if (!existsSync(destAssetsDir)) {
          mkdirSync(destAssetsDir, { recursive: true });
        }
        for (const file of readdirSync(assetsDir)) {
          if (file.startsWith(".")) continue;
          copyFileSync(resolve(assetsDir, file), resolve(destAssetsDir, file));
        }
        console.log("[copy-debugger-window-html] Copied HTML + assets to out/preload/");
      } else {
        console.warn("[copy-debugger-window-html] assets dir not found:", assetsDir);
      }
    }
  };
}
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "electron/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [copyChromeExtensionPreload(), copyDebuggerWindowHtml()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "preload/index.ts"),
          "debugger-preload": resolve(__electron_vite_injected_dirname, "electron/debugger-preload.ts"),
          "debugger-replay-preload": resolve(__electron_vite_injected_dirname, "electron/debugger-replay-preload.ts")
        }
      }
    }
  },
  renderer: {
    root: ".",
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src"),
        "vue": "vue/dist/vue.esm-bundler.js"
      }
    },
    optimizeDeps: {
      exclude: [
        "electron-chrome-extensions"
      ]
    },
    plugins: [
      vue({
        isProduction: false
      }),
      tailwindcss(),
      // 仅开发环境启用 Vue DevTools
      ...isProduction ? [] : [vueDevTools({ launchEditor: getEditor() })]
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
