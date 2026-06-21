import { Inter } from "next/font/google";
import "./styles.css";
import Sidebar from "../components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

export const metadata = {
  title: "SOS Dashboard",
  description: "Real-time operations dashboard for Smart Vehicle SOS"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen antialiased">
        <Sidebar />
        <main className="flex-1 bg-surface-page max-md:pb-16">{children}</main>
      </body>
    </html>
  );
}
