"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/branding/brand-mark";
import { DEFAULT_TAGLINE } from "@/lib/branding-shared";

const MAX_BYTES = 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

type State = { enabled: boolean; name: string; tagline: string; logo: string | null };

export function BrandingSettingsClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<State | null>(null);
  const [form, setForm] = useState<State>({ enabled: false, name: "", tagline: "", logo: null });
  const [logoChanged, setLogoChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => { if (d) { setSaved(d); setForm(d); } })
      .catch(() => {});
  }, []);

  const set = (patch: Partial<State>) => { setForm((f) => ({ ...f, ...patch })); setMsg(null); };

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) { setMsg({ kind: "error", text: "Choose a PNG, JPEG, GIF, WebP or SVG image." }); return; }
    if (file.size > MAX_BYTES) { setMsg({ kind: "error", text: "Logo must be 1 MB or smaller." }); return; }
    const reader = new FileReader();
    reader.onload = () => { set({ logo: String(reader.result) }); setLogoChanged(true); };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: form.enabled, name: form.name, tagline: form.tagline, ...(logoChanged ? { logo: form.logo } : {}) }),
    });
    setSaving(false);
    if (!res.ok) { setMsg({ kind: "error", text: (await res.json().catch(() => ({}))).error ?? "Save failed" }); return; }
    setSaved(form);
    setLogoChanged(false);
    setMsg({ kind: "ok", text: "Branding saved. It now applies across the platform and in emails." });
    router.refresh();
  }

  const preview = {
    custom: form.enabled && !!form.name.trim(),
    name: form.name.trim() || "Sympl PM",
    tagline: form.tagline.trim() || DEFAULT_TAGLINE,
    logoUrl: form.enabled ? form.logo : null,
  };
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(form);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900">Custom Branding</h3>
            <Badge variant={saved?.enabled ? "success" : "secondary"}>{saved?.enabled ? "On" : "Off"}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Replace &ldquo;Sympl PM&rdquo; with your own name and logo in the sidebar, on the sign-in pages, in the browser tab, on shared views and in every email. When off, the default branding is used.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty || (form.enabled && !form.name.trim())}>{saving ? "Saving…" : "Save"}</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" className="h-4 w-4" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Use custom branding
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Site name</label>
            <Input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. HD Compliance Analysis" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tagline <span className="text-gray-400 font-normal">(optional, shown on the sign-in page)</span></label>
            <Input value={form.tagline} maxLength={120} onChange={(e) => set({ tagline: e.target.value })} placeholder={DEFAULT_TAGLINE} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Site logo <span className="text-gray-400 font-normal">(PNG, JPEG, GIF, WebP or SVG, up to 1 MB; a wide or square logo about 56 px high works best)</span>
            </label>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4 mr-1.5" /> {form.logo ? "Replace logo" : "Upload logo"}</Button>
              {form.logo && <Button variant="ghost" onClick={() => { set({ logo: null }); setLogoChanged(true); }}><Trash2 className="h-4 w-4 mr-1.5" /> Remove</Button>}
            </div>
          </div>
          {msg && (
            <div className={msg.kind === "error" ? "rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" : "rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800"}>{msg.text}</div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preview</p>
          <div className="rounded-lg bg-gray-900 px-4 py-3 w-56 h-14 flex items-center overflow-hidden">
            <BrandMark size="sm" tone="dark" branding={preview} />
          </div>
          <div className="rounded-lg bg-gray-900 px-6 py-8 text-center">
            <BrandMark size="lg" tone="dark" branding={preview} className="justify-center" />
            <p className="text-gray-400 mt-2 text-sm">{preview.tagline}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
