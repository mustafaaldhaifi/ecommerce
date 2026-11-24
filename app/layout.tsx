import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "رِواء | حسابك",
  description: "تسجيل الدخول وإنشاء حساب في رِواء بالبريد الإلكتروني وكلمة المرور.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // NOTE: Browser extensions may add classes to <html> before hydration.
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
