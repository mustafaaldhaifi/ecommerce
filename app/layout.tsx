import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "رِواء | حسابك",
  description: "تسجيل الدخول وإنشاء حساب في رِواء بالبريد الإلكتروني وكلمة المرور.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
