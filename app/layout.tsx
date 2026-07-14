import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "JUICE. — 把复杂问题，写成清晰答案",
    description: "Juice 的个人博客，记录工程、AI 与持续成长。",
    openGraph: {
      title: "JUICE. — 把复杂问题，写成清晰答案",
      description: "关于工程、AI 与持续成长的个人记录。",
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "JUICE. 个人博客",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "JUICE. — 把复杂问题，写成清晰答案",
      description: "关于工程、AI 与持续成长的个人记录。",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
