"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/client";
import "./auth.css";

type AuthMode = "login" | "signup";
type SignupDialogState = "confirm-email" | "ready" | null;

const authErrorMessages: Record<string, string> = {
  invalid_credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  email_not_confirmed: "يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.",
  weak_password: "كلمة المرور ضعيفة. اختر كلمة مرور أقوى.",
  email_address_not_authorized: "تعذّر إرسال رسالة التأكيد إلى هذا البريد حاليًا.",
  over_email_send_rate_limit: "تم إرسال رسائل كثيرة. انتظر قليلًا ثم حاول مجددًا.",
  over_request_rate_limit: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.",
  request_timeout: "استغرق الاتصال وقتًا طويلًا. حاول مجددًا.",
};

/**
 * Displays the account forms and routes authenticated visitors to their dashboard.
 * 1. Verify an existing session before showing the forms.
 * 2. Manage the signup confirmation dialog.
 * 3. Submit login or signup requests.
 * 4. Render the appropriate waiting or account view.
 */
export default function Home() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [signupDialog, setSignupDialog] = useState<SignupDialogState>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const isSignup = mode === "signup";

  // STEP 1: Check the saved session before displaying account forms.
  useEffect(() => {
    let active = true;

    /**
     * Checks whether the visitor already has a valid Supabase account session.
     * 1. Request the current user from Supabase Auth.
     * 2. Send authenticated visitors to the dashboard.
     * 3. Show the forms when no valid session is available.
     */
    async function checkExistingSession() {
      try {
        // STEP 1: Verify the current user against Supabase Auth.
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;

        // STEP 2: Redirect only when the session is valid.
        if (!error && data.user) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // NOTE: A failed network check should leave the sign-in form available.
      }

      // STEP 3: Let signed-out visitors use the account forms.
      if (active) setIsCheckingSession(false);
    }

    void checkExistingSession();
    return () => { active = false; };
  }, [router]);

  // STEP 2: Keep the confirmation dialog in sync with signup results.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (signupDialog && !dialog.open) dialog.showModal();
    if (!signupDialog && dialog.open) dialog.close();
  }, [signupDialog]);

  function closeSignupDialog() {
    dialogRef.current?.close();
  }

  // STEP 3: Handle login and signup submissions.
  /**
   * Submits the selected authentication form.
   * 1. Ignore duplicate submissions and validate the visible fields.
   * 2. Lock the form while Supabase processes the selected action.
   * 3. Switch successful signups to login and show a confirmation dialog.
   * 4. Open the dashboard after sign-in or show a useful error message.
   * 5. Unlock the form after the request settles.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // STEP 1: Ignore repeated submits and validate the current fields.
    if (submissionInProgress.current) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();

    setMessage(null);

    if (!email || !password || (isSignup && (!firstName || !lastName))) {
      setMessage({ type: "error", text: "يرجى تعبئة جميع الحقول المطلوبة." });
      return;
    }

    // STEP 2: Lock the form and send the selected request.
    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        });

        if (error) throw error;

        // STEP 3: Prepare the login form and show the appropriate confirmation dialog.
        // NOTE: Without email confirmation, signUp starts a session; end only this browser session before login.
        if (data.session) await supabase.auth.signOut({ scope: "local" });

        setMode("login");
        setSignupDialog(data.session ? "ready" : "confirm-email");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // STEP 4: Open the dashboard after successful sign-in.
      setMessage({ type: "success", text: "تم تسجيل الدخول، جارٍ فتح لوحة التحكم..." });
      router.replace("/dashboard");
    } catch (error) {
      // STEP 4: Explain known authentication failures and allow a retry.
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";

      setMessage({
        type: "error",
        text: authErrorMessages[code] ?? "تعذّر إكمال العملية. تحقق من اتصالك وحاول مجددًا.",
      });
    } finally {
      // STEP 5: Unlock the form after success or failure.
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  // STEP 4: Avoid showing the sign-in form while checking an existing session.
  if (isCheckingSession) {
    return (
      <main className="auth-check" dir="rtl" role="status">
        <span className="auth-check-spinner" aria-hidden="true" />
        <span>جارٍ التحقق من حسابك...</span>
      </main>
    );
  }

  return (
    <main className="auth-page" dir="rtl">
      <div className="page-shell">
        <header className="site-header">
          <div className="brand" aria-label="رِواء">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="brand-name">رِواء<span className="brand-dot">.</span></span>
          </div>
          <span className="header-caption">تفاصيل صغيرة، حياة أجمل</span>
        </header>

        <div className="auth-layout">
          <section className="form-panel" aria-labelledby="auth-title">
            <div className="form-inner">
              <div className="eyebrow"><span className="eyebrow-line" />حسابك في رِواء</div>
              <h1 id="auth-title">{isSignup ? "ابدأ رحلتك معنا" : "يا هلا بعودتك"}<span className="heading-accent">.</span></h1>
              <p className="intro-copy">
                {isSignup
                  ? "أنشئ حسابك بخطوات بسيطة، واستمتع بتجربة تسوّق صُممت لك."
                  : "سعداء برؤيتك مجددًا. أدخل بريدك الإلكتروني وكلمة المرور للمتابعة."}
              </p>

              <div className="mode-switch" role="tablist" aria-label="طريقة الدخول">
                <button id="login-tab" type="button" role="tab" aria-selected={!isSignup} aria-controls="auth-fields" disabled={isSubmitting} className={!isSignup ? "mode-button active" : "mode-button"} onClick={() => { setMode("login"); setMessage(null); }}>تسجيل الدخول</button>
                <button id="signup-tab" type="button" role="tab" aria-selected={isSignup} aria-controls="auth-fields" disabled={isSubmitting} className={isSignup ? "mode-button active" : "mode-button"} onClick={() => { setMode("signup"); setMessage(null); }}>إنشاء حساب</button>
              </div>

              <form key={mode} id="auth-fields" role="tabpanel" aria-labelledby={isSignup ? "signup-tab" : "login-tab"} aria-busy={isSubmitting} onSubmit={handleSubmit} onChange={() => setMessage(null)}>
                {isSignup && (
                  <div className="name-row">
                    <div className="field-group">
                      <label htmlFor="first-name">الاسم الأول</label>
                      <input id="first-name" name="firstName" type="text" placeholder="مثال: سارة" autoComplete="given-name" required disabled={isSubmitting} />
                    </div>
                    <div className="field-group">
                      <label htmlFor="last-name">الاسم الأخير</label>
                      <input id="last-name" name="lastName" type="text" placeholder="مثال: أحمد" autoComplete="family-name" required disabled={isSubmitting} />
                    </div>
                  </div>
                )}

                <div className="field-group email-field">
                  <label htmlFor="email">البريد الإلكتروني</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <input ref={emailInputRef} required id="email" name="email" type="email" dir="ltr" placeholder="you@example.com" autoComplete="email" disabled={isSubmitting} />
                  </div>
                </div>

                <div className="field-group password-field">
                  <label htmlFor="password">كلمة المرور</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <input required id="password" name="password" type="password" dir="ltr" placeholder="••••••••" autoComplete={isSignup ? "new-password" : "current-password"} disabled={isSubmitting} />
                  </div>
                </div>

                <button className="submit-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <span className="button-spinner" aria-hidden="true" />}
                  <span>{isSubmitting ? (isSignup ? "جارٍ إنشاء الحساب..." : "جارٍ تسجيل الدخول...") : (isSignup ? "إنشاء حساب" : "تسجيل الدخول")}</span>
                  {!isSubmitting && <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              </form>

              <div className="auth-feedback">
                {isSubmitting ? (
                  <p className="auth-message loading" role="status">نتحقق من بياناتك، يرجى الانتظار...</p>
                ) : message && (
                  <p className={`auth-message ${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</p>
                )}
              </div>

              <div className="form-divider"><span>تجربة أبسط لك</span></div>
              <div className="simple-note">
                <span className="note-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span>بريدك الإلكتروني وكلمة المرور، كل ما تحتاجه للبدء.</span>
              </div>
            </div>
            <p className="form-footer">رِواء © ٢٠٢٦ <span aria-hidden="true">·</span> أشياء تحبّها، اختيرت لك.</p>
          </section>

          <aside className="visual-panel" aria-label="مجموعة رِواء المنزلية">
            <Image src="/auth-editorial.png" alt="ركن منزلي دافئ يضم مقعدًا أنيقًا وطاولة خشبية ومزهرية" fill priority sizes="(max-width: 900px) 100vw, 48vw" className="visual-image" />
            <div className="visual-shade" />
            <div className="visual-topline"><span className="topline-star">✳</span> اكتشف جمال التفاصيل</div>
            <div className="visual-content">
              <div className="visual-kicker">منزل يشبهك</div>
              <h2>مساحة أجمل<br />تبدأ من هنا<span>.</span></h2>
              <p>قطع مُختارة بعناية، لتصنع في كل زاوية حكاية تستحق أن تُعاش.</p>
              <div className="visual-bottom"><span className="visual-rule" /><span>رِواء — لمسة تُكمل يومك</span></div>
            </div>
          </aside>
        </div>
      </div>

      <dialog ref={dialogRef} className="signup-dialog" aria-labelledby="signup-dialog-title" aria-describedby="signup-dialog-description" onClose={() => { setSignupDialog(null); emailInputRef.current?.focus(); }}>
        <div className="dialog-inner">
          <button className="dialog-close" type="button" aria-label="إغلاق النافذة" onClick={closeSignupDialog}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <div className="dialog-success-icon" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none"><path d="m10 20 7 7 13-14" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span className="dialog-eyebrow">أهلًا بك في رِواء</span>
          <h2 id="signup-dialog-title">تم إنشاء حسابك بنجاح<span>.</span></h2>
          <p id="signup-dialog-description">
            {signupDialog === "confirm-email"
              ? "تحقق من بريدك الإلكتروني واضغط رابط التأكيد، ثم سجّل دخولك للمتابعة."
              : "حسابك جاهز الآن. سجّل دخولك ببريدك الإلكتروني وكلمة المرور للمتابعة."}
          </p>
          {signupDialog === "confirm-email" && (
            <div className="dialog-hint">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>قد تحتاج إلى مراجعة صندوق الرسائل غير المرغوب فيها.</span>
            </div>
          )}
          <button className="dialog-action" type="button" onClick={closeSignupDialog}>
            الانتقال إلى تسجيل الدخول
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </dialog>
    </main>
  );
}
