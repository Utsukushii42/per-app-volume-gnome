'use strict';

/* Per-App Volume Mixer — GNOME 43–47
 * - Mémorise le volume par application (clé stable), réapplique sur nouveaux flux
 * - X : kill + masque la ligne (ne réapparaît pas jusqu’à "Tout afficher")
 * - Icônes: PNG perso > .desktop (Gio.AppInfo) > thème
 * - Slider compact (~180px)
 * Dépendance : pactl (pulseaudio-utils)
 */

const { Gio, GLib, St, Clutter, GObject } = imports.gi;
const PanelMenu  = imports.ui.panelMenu;
const PopupMenu  = imports.ui.popupMenu;
const Slider     = imports.ui.slider;
const Main       = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// ---------- helpers ----------
function runCommand(argv) {
  try {
    const p = new Gio.Subprocess({
      argv, flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
    });
    p.init(null);
    const [, out] = p.communicate_utf8(null, null);
    return [p.get_successful(), (out || '').trim()];
  } catch (e) { log(`[per-app-volume] runCommand: ${e}`); return [false, '']; }
}
function parseSinkInputsJson(txt) { try { const a = JSON.parse(txt); return Array.isArray(a)?a:[]; } catch(e){ return []; } }
function getPercentForIndex(idx) {
  const [ok, out] = runCommand(['pactl','get-sink-input-volume', String(idx)]);
  if (!ok) return 1.0;
  const nums = [...out.matchAll(/(\d+)%/g)].map(m=>Number(m[1]));
  if (!nums.length) return 1.0;
  const avg = nums.reduce((a,b)=>a+b,0)/nums.length;
  return Math.max(0, Math.min(1, avg/100));
}
function setPercentForIndex(idx, frac) {
  const pct = Math.round(Math.max(0, Math.min(1, frac))*100);
  runCommand(['pactl','set-sink-input-volume', String(idx), `${pct}%`]);
}
function killSinkInput(idx){ runCommand(['pactl','kill-sink-input', String(idx)]); }
function _basename(p){ if(!p) return null; const s=String(p).split('/'); return s[s.length-1]; }

// ---------- clés stables (pour mémoriser par appli) ----------
function makeKey(props) {
  // Pas "media.name" (trop volatile). On combine nom app + binaire.
  const app = (props['application.name'] || '').toLowerCase();
  const bin = (_basename(props['application.process.binary']) || '').toLowerCase();
  const id  = (props['application.process.host'] || '').toLowerCase();  // bonus
  return `${app}|${bin}|${id}`;
}

// ---------- résolution d’icônes ----------
function buildIconIndex() {
  const map = new Map();
  try {
    const apps = Gio.AppInfo.get_all();
    for (const app of apps) {
      const id = app.get_id?.() || null;                 // "firefox.desktop"
      const exec = app.get_executable?.() || null;       // "/usr/bin/firefox"
      const icon = app.get_icon?.();
      if (icon) {
        if (id)   map.set(id.toLowerCase().replace(/\.desktop$/,''), icon);
        if (exec) map.set(_basename(exec).toLowerCase(), icon);
      }
    }
  } catch(e) { log(`[per-app-volume] buildIconIndex error: ${e}`); }
  return map;
}
function normName(s) { return String(s).toLowerCase().replace(/\.desktop$/,'').replace(/\s+/g,'-'); }
const ICON_ALIASES = new Map(Object.entries({
  'google-chrome-stable':'google-chrome',
  'chrome':'google-chrome',
  'code - oss':'code',
  'org.gnome.epiphany':'org.gnome.Epiphany',
  'webkitwebprocess':'org.gnome.Epiphany',
}));
function chooseIcon(props, iconIndex) {
  const raw = [
    props['application.icon_name'],
    props['media.icon_name'],
    props['window.icon_name'],
    props['application.name'],
    _basename(props['application.process.binary']),
  ].filter(Boolean);
  const cands = [];
  for (let c of raw) { c = normName(c); cands.push(ICON_ALIASES.get(c) || c); }

  // 1) PNG perso
  for (const n of cands) {
    try {
      const f = Me.dir.get_child('icons').get_child(`${n}.png`);
      if (f && f.query_exists(null)) return { gicon: new Gio.FileIcon({ file: f }) };
    } catch(_) {}
  }
  // 2) Icône .desktop
  for (const n of cands) { if (iconIndex.has(n)) return { gicon: iconIndex.get(n) }; }
  // 3) Thème
  if (cands.length) return { icon_name: cands[0] };
  // 4) Fallback
  return { icon_name: 'audio-x-generic-symbolic' };
}

// ---------- UI ----------
const AppVolumeItem = GObject.registerClass(
class AppVolumeItem extends PopupMenu.PopupBaseMenuItem {
  _init(idx, title, iconDesc, initialFrac, onChange, onRemove) {
    super._init({ reactive: true, can_focus: true });
    this._idx = idx;
    this._onChange = onChange;
    this._onRemove = onRemove;

    this.set_style('padding:4px 8px; margin:6px 8px; border-radius:10px;');

    // Icône
    let left;
    if (iconDesc.gicon) left = new St.Icon({ gicon: iconDesc.gicon, icon_size: 20, y_align: Clutter.ActorAlign.CENTER });
    else left = new St.Icon({ icon_name: iconDesc.icon_name, icon_size: 20, y_align: Clutter.ActorAlign.CENTER });
    this.add_child(left);

    this.add_child(new St.Widget({ width: 8 }));

    // Slider compact
    this._slider = new Slider.Slider(initialFrac);
    this._slider.accessible_name = `${title} volume`;
    this._slider.x_expand = false;
    this._slider.set_width(180);
    this._slider.set_style('margin:0 6px; padding:0;');
    this.add_child(this._slider);

    // Bouton X (masque + kill)
    const closeBtn = new St.Button({
      style_class: 'system-menu-action', reactive: true, can_focus: true,
      x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER
    });
    closeBtn.child = new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 });
    closeBtn.connect('clicked', () => {
      closeBtn.reactive = false; closeBtn.opacity = 128;
      if (this._onRemove) this._onRemove(this._idx);
      killSinkInput(this._idx);
      this.destroy(); // retire la ligne immédiatement
    });
    this.add_child(closeBtn);

    // Debounce volume
    this._pendingId = 0;
    const apply = () => {
      this._pendingId = 0;
      const v = this._slider.value;
      setPercentForIndex(this._idx, v);
      if (this._onChange) this._onChange(v);
    };
    this._valueChangedId = this._slider.connect('notify::value', () => {
      if (this._pendingId) GLib.source_remove(this._pendingId);
      this._pendingId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => { apply(); return GLib.SOURCE_REMOVE; });
    });
    this._dragEndId = this._slider.connect('drag-end', () => apply());
  }
  vfunc_destroy() {
    if (this._pendingId) GLib.source_remove(this._pendingId);
    if (this._slider && this._valueChangedId) this._slider.disconnect(this._valueChangedId);
    if (this._slider && this._dragEndId)     this._slider.disconnect(this._dragEndId);
    super.vfunc_destroy();
  }
});

const PerAppVolumeIndicator = GObject.registerClass(
class PerAppVolumeIndicator extends PanelMenu.Button {
  _init() {
    super._init(0.0, 'Per-App Volume Mixer');

    const icon = new St.Icon({ icon_name: 'audio-volume-high-symbolic', style_class: 'system-status-icon' });
    this.add_child(icon);

    // Actions haut
    const refreshItem = new PopupMenu.PopupMenuItem('Rafraîchir');
    refreshItem.connect('activate', () => this._rebuild());
    this.menu.addMenuItem(refreshItem);

    const showAllItem = new PopupMenu.PopupMenuItem('Tout afficher');
    showAllItem.connect('activate', () => { this._hiddenIdx.clear(); this._rebuild(); });
    this.menu.addMenuItem(showAllItem);

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this._listSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._listSection);

    // Stores en mémoire
    this._iconIndex = buildIconIndex();
    this._desiredVolByKey = new Map(); // key(app/bin/host) -> 0..1
    this._hiddenIdx = new Set();       // sink-input indices masqués (par ligne)

    // Refresh à l’ouverture + watcher events
    this.menu.connect('open-state-changed', (_m, open) => { if (open) this._rebuild(); });
    this._startWatcher();
  }

  _startWatcher() {
    try {
      this._watchCancel = new Gio.Cancellable();
      this._watchProc = new Gio.Subprocess({
        argv: ['pactl','subscribe'],
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
      });
      this._watchProc.init(null);
      const istream = this._watchProc.get_stdout_pipe();
      this._watchStream = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({ fd: istream.get_fd(), close_fd: false }) });

      const readLoop = () => {
        this._watchStream.read_line_utf8_async(GLib.PRIORITY_DEFAULT, this._watchCancel, (src, res) => {
          try {
            const [line] = src.read_line_utf8_finish(res);
            if (line && /sink-input|server|client/i.test(line)) this._rebuild();
            if (!this._watchCancel.is_cancelled()) GLib.idle_add(GLib.PRIORITY_DEFAULT, readLoop);
          } catch(_) {}
        });
      };
      readLoop();
    } catch(e) { log(`[per-app-volume] watcher error: ${e}`); }
  }
  _stopWatcher() {
    try { this._watchCancel?.cancel(); } catch(_) {}
    try { this._watchProc?.force_exit(); } catch(_) {}
    this._watchStream = null; this._watchProc = null; this._watchCancel = null;
  }

  _rebuild() {
    this._listSection.removeAll();

    const [ok, json] = runCommand(['pactl','-f','json','list','sink-inputs']);
    if (!ok) { this._listSection.addMenuItem(new PopupMenu.PopupMenuItem('Erreur: pactl indisponible', {reactive:false})); return; }
    const inputs = parseSinkInputsJson(json);

    if (inputs.length === 0) {
      this._listSection.addMenuItem(new PopupMenu.PopupMenuItem('Aucun flux audio actif', {reactive:false}));
      return;
    }

    for (const si of inputs) {
      const idx   = si.index;
      const props = si.properties || {};
      const key   = makeKey(props);
      if (this._hiddenIdx.has(idx)) continue; // masqué → ne pas afficher cette ligne uniquement

      const title = props['application.name'] || props['media.name'] || `App ${idx}`;
      const icon  = chooseIcon(props, this._iconIndex);

      // valeur initiale = volume mémorisé si connu, sinon volume réel
      const fracMem = this._desiredVolByKey.get(key);
      const frac = (typeof fracMem === 'number') ? fracMem : getPercentForIndex(idx);

      const row = new AppVolumeItem(
        idx, title, icon, frac,
        // onChange → mémorise la valeur
        (v) => { this._desiredVolByKey.set(key, v); },
        // onRemove → masque ce key (et kill le flux côté row)
        () => { this._hiddenIdx.add(idx); }
      );
      this._listSection.addMenuItem(row);

      // Si on avait une valeur mémorisée, on s’assure de l’appliquer au flux actuel
      if (typeof fracMem === 'number') {
        setPercentForIndex(idx, fracMem);
      } else {
        // première fois : mémorise ce qu’on lit
        this._desiredVolByKey.set(key, frac);
      }
    }
  }

  vfunc_destroy() { this._stopWatcher(); super.vfunc_destroy(); }
});

// ---------- entrypoints ----------
let indicator;
function init() {}
function enable(){ indicator = new PerAppVolumeIndicator(); Main.panel.addToStatusArea('per-app-volume-indicator', indicator, 1, 'right'); }
function disable(){ if (indicator){ indicator.destroy(); indicator = null; } }
