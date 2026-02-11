import Layout from '@/components/layout/Layout';

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <Layout>{children}</Layout>;
}
