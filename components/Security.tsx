"use client";

import { Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthError, cloudSignOut, getSession, mfa, type SessionInfo } from "@/lib/cloud";
import { useStore } from "@/lib/store";
import { Logo } from "./Onboarding";
import { CopyButton } from "./ui";

/* ------------------------------------------------------------- CAPTCHA -- */

type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback"?: () => void; theme?: string }) => string; remove: (id: string) => void };

let turnstileLoad: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  turnstileLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("CAPTCHA didn't load")));
    s.onerror = () => reject(new Error("CAPTCHA didn't load. Check your connection."));
    document.head.appendChild(s);
  });
  return turnstileLoad;
}

/** Cloudflare Turnstile, shown after repeated failed attempts. Calls onToken when the visitor passes. */
export function Captcha({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let id: string | null = null;
    let t: Turnstile | null = null;
    loadTurnstile()
      .then((ts) => {
        t = ts;
        if (box.current) id = ts.render(box.current, { sitekey: siteKey, callback: (tok) => onToken(tok), "expired-callback": () => onToken(null), theme: "auto" });
      })
      .catch((e: Error) => setErr(e.message));
    return () => {
      if (t && id) t.remove(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted">Too many tries. Confirm you&apos;re human to continue.</p>
      <div ref={box} />
      {err && <p className="mt-1 text-xs text-flame">{err}</p>}
    </div>
  );
}

/** Shared handling for auth calls: shows the CAPTCHA when the server asks for one. */
export function useAuthCall() {
  const [captchaKey, setCaptchaKey] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run<T>(fn: (captcha?: string) => Promise<T>): Promise<T | null> {
    setBusy(true);
    setErr(null);
    try {
      const out = await fn(captcha ?? undefined);
      setCaptchaKey(null);
      setCaptcha(null);
      return out;
    } catch (e) {
      const a = e instanceof AuthError ? e : null;
      if (a?.code === "captcha_required" && a.extra.siteKey) setCaptchaKey(a.extra.siteKey);
      setCaptcha(null);
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const widget = captchaKey ? <Captcha key={captchaKey + String(err)} siteKey={captchaKey} onToken={setCaptcha} /> : null;
  return { run, err, setErr, busy, widget, needsCaptcha: !!captchaKey && !captcha };
}

/* ----------------------------------------------------- sign-in, step 2 -- */

/** After the email code: the authenticator app, or a backup code. */
export function MfaChallenge() {
  const { finishSignIn } = useStore();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const a = useAuthCall();

  const submit = async () => {
    const ok = await a.run((captcha) => (backup ? mfa.backup(code, captcha) : mfa.verify(code, undefined, captcha)));
    if (!ok) return;
    if (backup) {
      try {
        sessionStorage.setItem("startit:reenroll", "1");
      } catch {}
    }
    await finishSignIn();
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
        <form
          className="w-full max-w-[420px] animate-rise text-center"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface">
            {backup ? <KeyRound className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{backup ? "Use a backup code" : "Two-step verification"}</h1>
          <p className="mt-2 text-sm text-muted">
            {backup
              ? "Enter one of the backup codes you saved. It works once, and it turns off your authenticator so you can set it up again."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          <label htmlFor="mfa-code" className="sr-only">{backup ? "Backup code" : "Authenticator code"}</label>
          <input
            id="mfa-code"
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            maxLength={backup ? 11 : 6}
            className="field tnum mt-6 py-3 text-center text-2xl tracking-[0.3em] uppercase"
            value={code}
            onChange={(e) => setCode(backup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
            placeholder={backup ? "ABCDE-FGH23" : "000000"}
            autoFocus
          />
          {a.widget}
          {a.err && <p className="mt-2 text-sm text-flame">{a.err}</p>}
          <button type="submit" className="btn-primary mt-3 w-full py-2.5" disabled={a.busy || a.needsCaptcha || (backup ? code.replace(/[^A-Z0-9]/g, "").length !== 10 : code.length !== 6)}>
            {a.busy ? "Checking…" : "Continue"}
          </button>
          <button
            type="button"
            className="btn-ghost mt-2 w-full"
            onClick={() => {
              setBackup(!backup);
              setCode("");
              a.setErr(null);
            }}
          >
            {backup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
          </button>
        </form>
      </main>
    </div>
  );
}

/* --------------------------------------------------------- backup codes -- */

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `STARTIT backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-abyss p-4">
      <p className="text-sm font-medium">Save your backup codes</p>
      <p className="text-xs text-muted">If you lose your phone, each code gets you in once. We only store a scrambled version, so we can&apos;t show them again.</p>
      <ol className="tnum grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <CopyButton text={codes.join("\n")} label="Copy codes" className="flex-1" />
        <button
          className="btn-ghost flex-1"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            a.download = "startit-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <Download className="h-4 w-4" /> Download
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-current" />
        I&apos;ve saved these codes
      </label>
      <button className="btn-primary w-full" disabled={!saved} onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/* --------------------------------------------------------- settings -- */

/** Settings: turn the authenticator app on or off, and replace backup codes. */
export function TwoFactorSettings() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const a = useAuthCall();

  const refresh = () => getSession().then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    void refresh();
  }, []);

  let reenroll = false;
  try {
    reenroll = sessionStorage.getItem("startit:reenroll") === "1";
  } catch {}

  if (!info?.signedIn) return null;
  const on = !!info.mfa?.enabled;

  if (codes) {
    return (
      <BackupCodes
        codes={codes}
        onDone={() => {
          setCodes(null);
          void refresh();
        }}
      />
    );
  }

  if (setup) {
    return (
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await a.run((captcha) => mfa.verify(code, setup.factorId, captcha));
          if (r?.backupCodes) {
            try {
              sessionStorage.removeItem("startit:reenroll");
            } catch {}
            setSetup(null);
            setCode("");
            setCodes(r.backupCodes);
          }
        }}
      >
        <p className="text-sm">Scan this with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-lg border border-line bg-white p-2" />
        <p className="text-xs text-muted">
          Can&apos;t scan? Type this key: <code className="select-all break-all rounded bg-abyss px-1.5 py-0.5 font-mono text-ink">{setup.secret}</code>
        </p>
        <label htmlFor="mfa-setup" className="sr-only">Code from your app</label>
        <input id="mfa-setup" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field tnum tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
        {a.widget}
        {a.err && <p className="text-sm text-flame">{a.err}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={a.busy || a.needsCaptcha || code.length !== 6}>
            {a.busy ? "Checking…" : "Turn on"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSetup(null)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        <ShieldCheck className={`mr-1.5 inline h-4 w-4 ${on ? "text-emerald" : "text-muted"}`} />
        {on ? `On. You have ${info.mfa?.backupCodesLeft ?? 0} unused backup codes.` : "Off. Add an authenticator app so a stolen email inbox isn't enough to get into your account."}
      </p>
      {!on && (reenroll || info.mfa?.requiredForAdmin) && (
        <p className="rounded-lg bg-flame/5 p-3 text-xs text-ink/80">
          {info.mfa?.requiredForAdmin ? "Admin features need two-step verification. Turn it on to use them." : "You used a backup code, so your authenticator was removed. Set it up again now."}
        </p>
      )}
      {!on ? (
        <button
          className="btn-primary"
          disabled={a.busy}
          onClick={async () => {
            const r = await a.run(() => mfa.enroll());
            if (r) setSetup(r);
          }}
        >
          <Smartphone className="h-4 w-4" /> Set up authenticator app
        </button>
      ) : disabling ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await a.run((captcha) => mfa.disable(code, captcha));
            if (r) {
              setDisabling(false);
              setCode("");
              void refresh();
            }
          }}
        >
          <label htmlFor="mfa-off" className="block text-xs text-muted">Enter a current code to confirm</label>
          <input id="mfa-off" inputMode="numeric" maxLength={6} className="field tnum tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
          {a.widget}
          <div className="flex gap-2">
            <button type="submit" className="btn-danger" disabled={a.busy || a.needsCaptcha || code.length !== 6}>
              Turn off
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDisabling(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            disabled={a.busy}
            onClick={async () => {
              const r = await a.run(() => mfa.newCodes());
              if (r) setCodes(r.backupCodes);
            }}
          >
            <KeyRound className="h-4 w-4" /> New backup codes
          </button>
          {!info.mfa?.requiredForAdmin && (
            <button className="btn-ghost" onClick={() => setDisabling(true)}>
              Turn off
            </button>
          )}
        </div>
      )}
      {a.err && !setup && <p className="text-sm text-flame">{a.err}</p>}
    </div>
  );
}
