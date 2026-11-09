import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { MotionProvider } from "@/components/motion-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "recall",
  description: "A chat agent that remembers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.add("js");if(localStorage.theme==="dark")document.documentElement.classList.add("dark");}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <MotionProvider>
          <TooltipProvider delay={250}>{children}</TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
