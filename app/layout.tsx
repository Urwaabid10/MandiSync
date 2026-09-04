import type { Metadata } from "next";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "MandiSync - منڈی سنک",
  description:
    "پاکستانی زرعی منڈیوں کا ڈیجیٹل پلیٹ فارم — Digital platform for Pakistani agricultural markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ur" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ChatbotWidget />
      </body>
    </html>
  );
}
