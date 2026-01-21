import Layout from '@/components/layout/Layout';

export default function PaymentsPage() {
  return (
    <Layout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Payments</h1>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
          <p className="text-gray-600">Payment management will be implemented here.</p>
        </div>
      </div>
    </Layout>
  );
}

