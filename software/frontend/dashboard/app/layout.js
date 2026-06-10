import "./styles.css";

export const metadata = {
  title: "SOS Dashboard",
  description: "Business real-time dashboard for Smart Vehicle SOS"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
