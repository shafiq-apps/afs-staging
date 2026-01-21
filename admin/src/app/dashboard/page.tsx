import Layout from '@/components/layout/Layout';

export default function DashboardPage() {
  return (
    <Layout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Shops</h3>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Active Subscriptions</h3>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Team Members</h3>
            <p className="text-3xl font-bold text-gray-900">-</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

