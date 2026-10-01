import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Share_Tech_Mono, VT323 } from "next/font/google";
import "./globals.css";
import MatrixRain from "@/components/MatrixRain";

// Terminal / monospace fonts evoking the Matrix code look.
const techMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-cinzel", // reuse existing variable slots used across the app
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Morpheus // Matrix RPG Solo",
  description:
    "Jogue Matrix RPG com Morpheus: regras de Dan Aguiar / Artefato incorporadas, ficha por conversa e dados d6. Sem importar PDF.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${techMono.variable} ${vt323.variable}`}>
      <body className="antialiased">
        <MatrixRain />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
