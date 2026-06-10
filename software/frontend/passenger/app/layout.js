import "./styles.css";

export const metadata = {
  title: "Passenger SOS",
  description: "Passenger emergency form for Smart Vehicle SOS"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
