
// Shared layout for public pages (/landing, /pricing)
// Deliberately minimal — no AppProvider or Firebase context loaded
// so these pages are fast, SEO-friendly server components.
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
