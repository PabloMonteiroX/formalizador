// registry.js — anfitrión de plugins. La app emite eventos; los plugins escuchan.
// Un plugin es un módulo ES con `export default function setup(host) {}`.
// Si un plugin falla, la app sigue funcionando: los errores se aíslan aquí.

export const PLUGINS = [
  { id: "farad8", name: "FARAD-8 · tutor retro", desc: "Te acompaña, te da pistas y comprueba que entiendes cada fórmula.", load: () => import("./farad8/farad8.js") },
];

const FLAGS_KEY = "formalizador:plugins";

export function createHost(api) {
  const handlers = new Map();
  const menuItems = [];
  const readFlags = () => { try { return JSON.parse(localStorage.getItem(FLAGS_KEY) || "{}"); } catch { return {}; } };

  const host = {
    ...api, // getCard, logic, toast, openInfo, escapeHTML
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    emit(evt, data) {
      for (const fn of handlers.get(evt) || []) {
        try { fn(data); } catch (e) { console.error(`[plugin:${evt}]`, e); }
      }
    },
    // Almacenamiento con espacio de nombres propio para cada plugin.
    storage(ns) {
      const key = `formalizador:plugin:${ns}`;
      return {
        get() { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } },
        set(v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } },
      };
    },
    addMenuItem(id, label, fn) { menuItems.push({ id, label, fn }); api.onMenuChange?.(menuItems); },
    menuItems: () => menuItems,
    isEnabled(id) { return readFlags()[id] !== false; }, // activados por defecto
    setEnabled(id, on) { const f = readFlags(); f[id] = !!on; try { localStorage.setItem(FLAGS_KEY, JSON.stringify(f)); } catch { /* */ } },
    async loadAll() {
      for (const p of PLUGINS) {
        if (!host.isEnabled(p.id)) continue;
        try { const m = await p.load(); await m.default(host); host.emit("plugin:ready", p.id); }
        catch (e) { console.error(`[plugin ${p.id}] no se ha podido cargar`, e); }
      }
    },
  };
  return host;
}
