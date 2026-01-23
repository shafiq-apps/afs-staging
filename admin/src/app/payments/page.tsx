import Layout from '@/components/layout/Layout';

export default function PaymentsPage() {
  return (
    <Layout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Payments</h1>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
          <p className="text-gray-600 dark:text-gray-300">Payment management will be implemented here.</p>
        </div>
      </div>
    </Layout>
  );
}

