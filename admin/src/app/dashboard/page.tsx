import ESMonitoring from '@/components/ESMonitoring';
import Layout from '@/components/layout/Layout';

export default function DashboardPage() {
  return (
    <Layout>
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Shops</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">-</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Active Subscriptions</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">-</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Revenue</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">-</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Team Members</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">-</p>
          </div>
        </div>
      </div>
      <div className='font-bold text-gray-900 dark:text-gray-100 mb-6'>
        <ESMonitoring />
      </div>
    </Layout>
  );
}

