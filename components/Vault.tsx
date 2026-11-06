"use client";

import { Download, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cloudSignOut, rotateRecoveryKey } from "@/lib/cloud";
import { useStore } from "@/lib/store";
import { Logo } from "./Onboarding";
import { CopyButton } from "./ui";

/** Shown on a device that doesn't have the key yet: the founder types their recovery key. */
export function UnlockScreen() {
  const { vault, cloudEmail } = useStore();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lost, setLost] = useState(false);

  const unlock = async () => {
    setBusy(true);
    setErr(null);
    try {
      await vault.unlock(code);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <button className="text-sm text-muted hover:text-ink" onClick={() => void cloudSignOut().then(() => window.location.reload())}>
          Sign out
        </button>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-[440px] animate-rise">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight">Unlock your workspace</h1>
          <p className="mt-2 text-center text-sm text-muted">
            Your workspace is end-to-end encrypted. Enter the recovery key you saved when you set it up{cloudEmail ? ` for ${cloudEmail}` : ""}. Only you have it.
          </p>

          {!lost ? (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
            >
              <label htmlFor="rk" className="mb-1.5 block text-sm font-medium">Recovery key</label>
              <textarea
                id="rk"
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className="field tnum resize-none font-mono text-sm tracking-wide"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-…"
              />
              {err && <p className="mt-2 text-sm text-flame">{err}</p>}
              <button type="submit" className="btn-primary mt-3 w-full py-2.5" disabled={busy || code.replace(/[\s-]/g, "").length < 52}>
                {busy ? "Unlocking…" : "Unlock"}
              </button>
              <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setLost(true)}>
                I lost my recovery key
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded-xl border border-flame/30 bg-flame/5 p-4 text-sm">
              <p className="font-medium">Without the key, nobody can open this workspace. Not even STARTIT.</p>
              <p className="mt-1.5 text-muted">
                That&apos;s what keeps it private. If you&apos;ve lost the key everywhere, you can delete the locked workspace and start a new, empty one. This can&apos;t be undone.
              </p>
              <div className="mt-4 flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setLost(false)}>
                  Go back
                </button>
                <button
                  className="btn-primary flex-1 bg-flame"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await vault.reset();
                    } catch (e) {
                      setErr((e as Error).message);
                      setBusy(false);
                    }
                  }}
                >
                  Delete and start fresh
                </button>
              </div>
              {err && <p className="mt-2 text-sm text-flame">{err}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** The one time the founder sees their recovery key. It can't be closed until they confirm they saved it. */
export function RecoveryKeyDialog() {
  const { vault, cloudEmail } = useStore();
  const [saved, setSaved] = useState(false);
  const code = vault.recovery;
  if (!code) return null;

  const download = () => {
    const text = [
      "STARTIT recovery key",
      cloudEmail ? `Account: ${cloudEmail}` : "",
      "",
      code,
      "",
      "This key unlocks your encrypted workspace on a new device.",
      "Keep it somewhere safe, like a password manager. STARTIT can't recover it for you.",
    ]
      .filter((l, i) => l || i > 1)
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "startit-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Save your recovery key">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative max-h-[92vh] w-full animate-rise overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald" />
          <h2 className="text-base font-semibold">Save your recovery key</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Your workspace is encrypted on this device before it&apos;s saved, so only you can read it. Not STARTIT, not anyone with access to our servers. You&apos;ll need this key to open it on
          another device or after signing out.
        </p>
        <div className="mt-4 rounded-xl border border-line bg-abyss p-4 text-center font-mono text-[15px] leading-relaxed tracking-wide [word-spacing:0.2em]">
          {code.split("-").join(" - ")}
        </div>
        <div className="mt-3 flex gap-2">
          <CopyButton text={code} label="Copy key" className="flex-1" />
          <button className="btn-ghost flex-1" onClick={download}>
            <Download className="h-4 w-4" /> Download
          </button>
        </div>
        <p className="mt-4 flex gap-2 rounded-lg bg-flame/5 p-3 text-xs leading-relaxed text-ink/80">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
          Put it in a password manager or write it down. We can&apos;t show it again or recover it. If you lose it and sign out, your workspace stays locked for good.
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-current" />
          I&apos;ve saved my recovery key somewhere safe
        </label>
        <button className="btn-primary mt-3 w-full py-2.5" disabled={!saved} onClick={vault.dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}

/** Settings: what's encrypted, and a way to replace a recovery key that may have leaked. */
export function EncryptionSettings() {
  const { state, vault, cloudEmail } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cloudEmail) {
    return (
      <>
        <p className="text-sm text-muted">
          <ShieldCheck className="mr-1.5 inline h-4 w-4 text-emerald" />
          Your workspace is stored only in this browser. It never leaves your device.
        </p>
        <DownloadData />
      </>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <ShieldCheck className="mr-1.5 inline h-4 w-4 text-emerald" />
        End-to-end encrypted. Your workspace is locked on your device with a key only you hold, so nobody else can read it.
      </p>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            vault.show(await rotateRecoveryKey(state));
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(false);
        }}
      >
        <KeyRound className="h-4 w-4" /> {busy ? "Making a new key…" : "Get a new recovery key"}
      </button>
      <p className="text-xs text-muted">Your old key stops working. Use this if you think someone else has seen it.</p>
      {err && <p className="text-sm text-flame">{err}</p>}
      <DownloadData />
    </div>
  );
}

/** Everything in the workspace as a JSON file: the founder's data, theirs to keep. */
function DownloadData() {
  const { state } = useStore();
  return (
    <button
      className="btn-ghost"
      onClick={() => {
        const { toast, pendingPrompt, ready, ...data } = state;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" }));
        a.download = `startit-${(state.idea?.name || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      <Download className="h-4 w-4" /> Download my data
    </button>
  );
}
