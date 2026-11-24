"use client";

import Image from "next/image";
import { useState } from "react";

type AuthMode = "login" | "signup";

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const isSignup = mode === "signup";

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
                <button id="login-tab" type="button" role="tab" aria-selected={!isSignup} aria-controls="auth-fields" className={!isSignup ? "mode-button active" : "mode-button"} onClick={() => setMode("login")}>تسجيل الدخول</button>
                <button id="signup-tab" type="button" role="tab" aria-selected={isSignup} aria-controls="auth-fields" className={isSignup ? "mode-button active" : "mode-button"} onClick={() => setMode("signup")}>إنشاء حساب</button>
              </div>

              <form id="auth-fields" role="tabpanel" aria-labelledby={isSignup ? "signup-tab" : "login-tab"} onSubmit={(event) => event.preventDefault()}>
                {isSignup && (
                  <div className="name-row">
                    <div className="field-group">
                      <label htmlFor="first-name">الاسم الأول</label>
                      <input id="first-name" name="firstName" type="text" placeholder="مثال: سارة" autoComplete="given-name" />
                    </div>
                    <div className="field-group">
                      <label htmlFor="last-name">الاسم الأخير</label>
                      <input id="last-name" name="lastName" type="text" placeholder="مثال: أحمد" autoComplete="family-name" />
                    </div>
                  </div>
                )}

                <div className="field-group email-field">
                  <label htmlFor="email">البريد الإلكتروني</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <input id="email" name="email" type="email" dir="ltr" placeholder="you@example.com" autoComplete="email" />
                  </div>
                </div>

                <div className="field-group password-field">
                  <label htmlFor="password">كلمة المرور</label>
                  <div className="input-wrap">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <input id="password" name="password" type="password" dir="ltr" placeholder="••••••••" autoComplete={isSignup ? "new-password" : "current-password"} />
                  </div>
                </div>

                <button className="submit-button" type="submit">
                  <span>{isSignup ? "إنشاء حساب" : "تسجيل الدخول"}</span>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </form>

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
    </main>
  );
}
